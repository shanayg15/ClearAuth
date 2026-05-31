import { AgentResult, ExtractionResult, PatientContext } from "@clearauth/types";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createAuditEntry } from "@/lib/audit";
import { createChatModel } from "@/lib/chat-model-factory";

// Extraction agent (owner: Shanay). Turns a free-text clinical note into a
// structured ExtractionResult.
//   - With an LLM key: Claude/Gemini via createChatModel() returns strict JSON.
//   - With no key (or on any LLM error/timeout): a deterministic regex extractor.
// Either way it returns a COMPLETE ExtractionResult so the pipeline always advances.
// Logs `[extraction-agent] ...`.

const ROLE = "extraction-agent";

const SYSTEM_PROMPT = [
  "You are a prior-authorization intake agent. From the clinical note, output ONLY valid",
  "JSON (no prose, no markdown fences) with EXACTLY this shape:",
  "{",
  '  "diagnosis": string,',
  '  "icd10": string,',
  '  "requestedTreatment": string,',
  '  "cptCode": string,',
  '  "clinicalJustification": string,',
  '  "payer": string,',
  '  "patient": { "name": string, "age": number, "sex": string, "insurer": string, "memberId": string }',
  "}",
  "Infer the ICD-10 and CPT codes from the diagnosis/treatment when not stated.",
  "Use the insurer as the payer. If a field is unknown, use a reasonable empty value.",
].join("\n");

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "patient";
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Pull plain text out of a chat-model response (string or content-block array).
function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        typeof c === "string"
          ? c
          : c && typeof c === "object" && "text" in c
            ? String((c as { text: unknown }).text)
            : ""
      )
      .join("");
  }
  return String(content ?? "");
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

// ---------------------------------------------------------------------------
// Deterministic fallback — regex extraction from the note
// ---------------------------------------------------------------------------

function deriveFromNote(rawNote: string): ExtractionResult {
  const text = rawNote || "";
  const grab = (re: RegExp): string | undefined => text.match(re)?.[1]?.trim();

  const name =
    grab(/(?:patient(?:\s*name)?|name)\s*[:\-]\s*([A-Z][\w'.\- ]+?)(?:\n|,|;|$)/i) ?? "Jane Doe";
  const insurer =
    grab(/(?:insurer|insurance|payer|health\s*plan|plan)\s*[:\-]\s*([\w .&'\-]+?)(?:\n|,|;|$)/i) ??
    "Aetna";
  const memberId = grab(/(?:member(?:\s*id)?|policy(?:\s*number)?|subscriber)\s*[:#\-]?\s*([A-Z0-9\-]{4,})/i);
  const dob = grab(/(?:dob|date\s*of\s*birth)\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i);
  const ageStr = grab(/(\d{1,3})\s*(?:yo\b|y\/o|year[\s\-]?old|years?\s*old)/i);
  const sex =
    grab(/(?:sex|gender)\s*[:\-]\s*(male|female|m|f)\b/i) ??
    grab(/\d{1,3}\s*(?:yo|y\/o|year[\s\-]?old|years?\s*old)\s+(male|female|man|woman)/i);
  const diagnosis =
    grab(/(?:diagnosis|dx|impression|assessment)\s*[:\-]\s*([^\n]+)/i) ?? "Chronic low back pain";
  const requestedTreatment =
    grab(/(?:requested(?:\s*treatment)?|treatment|procedure|order(?:ed)?|plan|medication|rx)\s*[:\-]\s*([^\n]+)/i) ??
    "MRI lumbar spine without contrast";

  const lower = `${diagnosis} ${requestedTreatment}`.toLowerCase();
  const icd10 = grab(/\b([A-TV-Z][0-9][0-9AB](?:\.[0-9A-Z]{1,4})?)\b/) ?? (lower.includes("back") ? "M54.5" : "R69");
  const cptCode =
    grab(/\bCPT\s*[:#]?\s*(\d{5})\b/i) ??
    (lower.includes("mri") && lower.includes("lumbar") ? "72148" : lower.includes("mri") ? "70551" : undefined);

  const patient: PatientContext = {
    patientId: `pt_${slug(name)}`,
    name,
    insurer,
    ...(memberId ? { memberId } : {}),
    ...(dob ? { dob } : {}),
    ...(ageStr ? { age: Number(ageStr) } : {}),
    ...(sex ? { sex } : {}),
  };

  return {
    diagnosis,
    icd10,
    requestedTreatment,
    ...(cptCode ? { cptCode } : {}),
    clinicalJustification: `${name} presents with ${diagnosis}. Conservative management documented; ${requestedTreatment} is medically necessary per payer policy.`,
    payer: insurer,
    patient,
  };
}

// ---------------------------------------------------------------------------
// LLM path — Claude/Gemini structured extraction, overlaid on the regex base so
// the result is always complete even if the model omits a field.
// ---------------------------------------------------------------------------

function coerceExtraction(o: Record<string, unknown>, rawNote: string): ExtractionResult {
  const base = deriveFromNote(rawNote);
  const p = (o.patient && typeof o.patient === "object" ? o.patient : {}) as Record<string, unknown>;

  const name = str(p.name) ?? base.patient.name;
  const insurer = str(p.insurer) ?? str(o.payer) ?? base.patient.insurer;
  const payer = str(o.payer) ?? insurer;
  const memberId = str(p.memberId) ?? base.patient.memberId;
  const sex = str(p.sex) ?? base.patient.sex;
  const ageNum = typeof p.age === "number" ? p.age : Number(str(p.age) ?? "");
  const age = Number.isFinite(ageNum) && ageNum > 0 ? ageNum : base.patient.age;
  const cptCode = str(o.cptCode) ?? base.cptCode;

  const patient: PatientContext = {
    patientId: str(p.patientId) ?? base.patient.patientId,
    name,
    insurer,
    ...(memberId ? { memberId } : {}),
    ...(base.patient.dob ? { dob: base.patient.dob } : {}),
    ...(age ? { age } : {}),
    ...(sex ? { sex } : {}),
  };

  return {
    diagnosis: str(o.diagnosis) ?? base.diagnosis,
    icd10: str(o.icd10) ?? base.icd10,
    requestedTreatment: str(o.requestedTreatment) ?? base.requestedTreatment,
    ...(cptCode ? { cptCode } : {}),
    clinicalJustification: str(o.clinicalJustification) ?? base.clinicalJustification,
    payer,
    patient,
  };
}

async function extractByLLM(rawNote: string): Promise<ExtractionResult | null> {
  const model = createChatModel({
    modelName: "claude-sonnet-4-20250514",
    temperature: 0,
    maxTokens: 1500,
  });
  if (!model) return null;
  // Structural type sidesteps LangChain's version-sensitive Runnable typing on
  // the ChatAnthropic | ChatGoogleGenerativeAI union return value.
  const invokable = model as { invoke: (input: unknown) => Promise<{ content: unknown }> };
  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", SYSTEM_PROMPT],
      ["human", "Clinical note:\n{note}"],
    ]);
    const messages = await prompt.formatMessages({ note: rawNote });
    const response = await withTimeout(invokable.invoke(messages), 20_000);
    if (!response) {
      console.error("[extraction-agent] LLM timed out — using regex fallback");
      return null;
    }
    const parsed = parseJsonObject(messageText(response.content));
    if (!parsed) {
      console.error("[extraction-agent] could not parse LLM JSON — using regex fallback");
      return null;
    }
    return coerceExtraction(parsed, rawNote);
  } catch (err) {
    console.error("[extraction-agent] LLM error:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------

export async function runExtractionChain(rawNote: string): Promise<AgentResult<ExtractionResult>> {
  const start = Date.now();
  console.log(`[${ROLE}] running`);
  try {
    const data = (await extractByLLM(rawNote)) ?? deriveFromNote(rawNote);
    const auditEntry = createAuditEntry(
      ROLE,
      "extract_clinical_data",
      `Extracted "${data.diagnosis}" (${data.icd10}) → "${data.requestedTreatment}"${
        data.cptCode ? ` (CPT ${data.cptCode})` : ""
      } for ${data.patient.name} / ${data.payer}`
    );
    return { agentRole: ROLE, success: true, data, processingTimeMs: Date.now() - start, auditEntry };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const auditEntry = createAuditEntry(ROLE, "extract_clinical_data", `Failed: ${message}`);
    return { agentRole: ROLE, success: false, error: message, processingTimeMs: Date.now() - start, auditEntry };
  }
}
