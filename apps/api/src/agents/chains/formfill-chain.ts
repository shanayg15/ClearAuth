import { AgentResult, CriteriaResult, ExtractionResult, FormFillResult } from "@clearauth/types";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createAuditEntry } from "@/lib/audit";
import { createChatModel } from "@/lib/chat-model-factory";
import { storeObject } from "@/lib/tigris";

// Form-fill agent (owner: Shanay). Produces the completed payer PA form + a
// human-readable packet, and stores the packet in Tigris.
//   - With an LLM key: Claude fills the form fields and writes the packet prose.
//   - With no key (or on any error): a deterministic mapping + templated packet.
// The formFields KEYS match the mock payer portal's <input name> attributes
// EXACTLY (see apps/payer-portal/src/lib/fields.ts), so Rtrvr can submit them
// straight through. Logs `[formfill-agent] ...`.

const ROLE = "formfill-agent";

// Canonical payer-portal field names — keep in lockstep with PORTAL_FIELDS.
const FIELD_NAMES = [
  "patientName",
  "memberId",
  "diagnosisCode",
  "procedureCode",
  "treatment",
  "requestingProvider",
  "clinicalJustification",
] as const;

const DEFAULT_PROVIDER = "Dr. Demo, MD";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Deterministic fallback
// ---------------------------------------------------------------------------

function fallbackFields(extraction: ExtractionResult): Record<string, string> {
  return {
    patientName: extraction.patient.name,
    memberId: extraction.patient.memberId ?? "",
    diagnosisCode: extraction.icd10,
    procedureCode: extraction.cptCode ?? "",
    treatment: extraction.requestedTreatment,
    requestingProvider: DEFAULT_PROVIDER,
    clinicalJustification: extraction.clinicalJustification,
  };
}

function buildPacket(
  fields: Record<string, string>,
  extraction: ExtractionResult,
  criteria: CriteriaResult
): string {
  return [
    "# Prior Authorization Request",
    "",
    `**Patient:** ${fields.patientName}`,
    `**Member ID:** ${fields.memberId || "—"}`,
    `**Insurer:** ${extraction.payer}`,
    `**Requesting Provider:** ${fields.requestingProvider}`,
    "",
    "## Clinical Summary",
    `- **Diagnosis:** ${extraction.diagnosis} (${fields.diagnosisCode})`,
    `- **Requested Treatment:** ${fields.treatment}${fields.procedureCode ? ` (CPT ${fields.procedureCode})` : ""}`,
    "",
    "## Justification",
    fields.clinicalJustification,
    "",
    `## Coverage Criteria — ${extraction.payer}`,
    ...criteria.requiredCriteria.map(
      (c) => `- [${c.met ? "x" : " "}] ${c.label}${c.evidence ? ` — ${c.evidence}` : ""}`
    ),
    "",
    `_Coverage source: ${criteria.coverageSource ?? "standard payer medical policy"}._`,
    `_All criteria met: ${criteria.allMet ? "yes" : "no"}._`,
  ].join("\n");
}

// Coerce LLM output onto the canonical field set, defaulting from the fallback.
function coerceFields(
  llm: Record<string, unknown> | undefined,
  base: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of FIELD_NAMES) {
    out[name] = (llm ? str(llm[name]) : undefined) ?? base[name] ?? "";
  }
  return out;
}

// ---------------------------------------------------------------------------
// LLM path
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  "You are a prior-authorization form-filling agent. Given the structured request and the",
  "payer's coverage criteria, complete the payer's PA form. Output ONLY valid JSON (no prose,",
  "no markdown fences) with this shape:",
  "{",
  '  "formFields": {',
  '    "patientName": string, "memberId": string, "diagnosisCode": string,',
  '    "procedureCode": string, "treatment": string, "requestingProvider": string,',
  '    "clinicalJustification": string',
  "  },",
  '  "packetMarkdown": string',
  "}",
  "diagnosisCode is the ICD-10, procedureCode is the CPT. packetMarkdown is a concise",
  "human-readable summary of the request and how each coverage criterion is satisfied.",
].join("\n");

async function fillByLLM(
  extraction: ExtractionResult,
  criteria: CriteriaResult,
  base: Record<string, string>
): Promise<{ formFields: Record<string, string>; packetMarkdown: string } | null> {
  const model = createChatModel({
    modelName: "claude-sonnet-4-20250514",
    temperature: 0,
    maxTokens: 1500,
  });
  if (!model) return null;
  const invokable = model as { invoke: (input: unknown) => Promise<{ content: unknown }> };
  try {
    const context = {
      extraction: {
        diagnosis: extraction.diagnosis,
        icd10: extraction.icd10,
        requestedTreatment: extraction.requestedTreatment,
        cptCode: extraction.cptCode ?? "",
        clinicalJustification: extraction.clinicalJustification,
        payer: extraction.payer,
        patient: extraction.patient,
      },
      criteria: {
        payer: criteria.payer,
        treatment: criteria.treatment,
        allMet: criteria.allMet,
        requiredCriteria: criteria.requiredCriteria,
      },
    };
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", SYSTEM_PROMPT],
      ["human", "Structured request + criteria (JSON):\n{context}"],
    ]);
    const messages = await prompt.formatMessages({ context: JSON.stringify(context, null, 2) });
    const response = await withTimeout(invokable.invoke(messages), 20_000);
    if (!response) {
      console.error("[formfill-agent] LLM timed out — using deterministic fill");
      return null;
    }
    const parsed = parseJsonObject(messageText(response.content));
    if (!parsed) {
      console.error("[formfill-agent] could not parse LLM JSON — using deterministic fill");
      return null;
    }
    const llmFields =
      parsed.formFields && typeof parsed.formFields === "object"
        ? (parsed.formFields as Record<string, unknown>)
        : undefined;
    const formFields = coerceFields(llmFields, base);
    const packetMarkdown = str(parsed.packetMarkdown) ?? buildPacket(formFields, extraction, criteria);
    return { formFields, packetMarkdown };
  } catch (err) {
    console.error("[formfill-agent] LLM error:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------

export async function runFormFillChain(
  extraction: ExtractionResult,
  criteria: CriteriaResult,
  requestId?: string
): Promise<AgentResult<FormFillResult>> {
  const start = Date.now();
  console.log(`[${ROLE}] running`);
  try {
    const base = fallbackFields(extraction);
    const filled =
      (await fillByLLM(extraction, criteria, base)) ?? {
        formFields: base,
        packetMarkdown: buildPacket(base, extraction, criteria),
      };

    const packetKey = requestId
      ? `packets/${requestId}.md`
      : `packets/${extraction.patient.patientId}-${Date.now()}.md`;
    await storeObject(packetKey, filled.packetMarkdown, "text/markdown");

    const data: FormFillResult = {
      formFields: filled.formFields,
      packetMarkdown: filled.packetMarkdown,
      packetKey,
    };
    const auditEntry = createAuditEntry(
      ROLE,
      "fill_form",
      `Completed ${Object.keys(filled.formFields).length}-field PA form for ${extraction.patient.name}; packet stored at ${packetKey}`
    );
    return { agentRole: ROLE, success: true, data, processingTimeMs: Date.now() - start, auditEntry };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const auditEntry = createAuditEntry(ROLE, "fill_form", `Failed: ${message}`);
    return { agentRole: ROLE, success: false, error: message, processingTimeMs: Date.now() - start, auditEntry };
  }
}
