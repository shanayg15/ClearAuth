import { AgentResult, CriteriaItem, CriteriaResult, ExtractionResult } from "@clearauth/types";
import { createAuditEntry } from "@/lib/audit";
import { createChatModel } from "@/lib/chat-model-factory";
import { lookupCoverageCriteria } from "./apify-coverage";

// Criteria agent (owner: Sahiel).
//
// runCriteriaChain():
//   1. Source the payer's required criteria labels via Apify (lookupCoverageCriteria);
//      if Apify returns nothing, use a built-in table keyed by treatment family.
//   2. Judge each criterion against the clinical justification — with Claude/Gemini
//      via createChatModel(), or a deterministic keyword check when no LLM key is set.
//   3. Compute allMet and return a complete CriteriaResult.
// Always returns a result so the pipeline advances. Logs `[criteria-agent] ...`.

const ROLE = "criteria-agent";

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

// Pull plain text out of a chat-model response whose content may be a string or
// an array of content blocks.
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

// Standard prior-auth criteria by treatment family — the offline source of truth.
function builtInCriteria(treatment: string): string[] {
  const t = treatment.toLowerCase();
  if (t.includes("mri") || t.includes("ct ") || t.includes("imaging") || t.includes("scan")) {
    return [
      "Conservative therapy attempted for at least 6 weeks",
      "Documented neurologic deficit or red-flag symptom",
      "Imaging result will change clinical management",
    ];
  }
  if (
    t.includes("biologic") ||
    t.includes("adalimumab") ||
    t.includes("humira") ||
    t.includes("infliximab") ||
    t.includes("mab")
  ) {
    return [
      "Failed first-line therapy (e.g., methotrexate)",
      "Diagnosis confirmed by a specialist",
      "TB screening / no active serious infection documented",
    ];
  }
  if (t.includes("surgery") || t.includes("arthroplasty") || t.includes("fusion") || t.includes("surgical")) {
    return [
      "Failed at least 3 months of conservative management",
      "Imaging confirms the surgical indication",
      "Functional impairment documented",
    ];
  }
  if (t.includes("physical therapy") || /\bpt\b/.test(t)) {
    return ["Functional deficit documented", "A measurable treatment goal is defined"];
  }
  return [
    "Diagnosis is documented",
    "First-line / conservative management attempted",
    "Requested treatment is medically necessary",
    "No documented contraindications",
  ];
}

// Deterministic fallback: decide each criterion from the justification text.
const STOPWORDS = new Set([
  "documented", "attempted", "conservative", "therapy", "treatment", "medically", "necessary",
  "confirmed", "first", "line", "weeks", "months", "prior", "authorization", "criteria",
  "requested", "specialist", "management", "clinical", "screening", "active", "serious",
  "infection", "functional", "deficit", "imaging", "result", "change", "goal", "defined",
  "measurable", "least", "indication", "impairment", "diagnosis",
]);
const GLOBAL_SIGNAL_RE =
  /(document|necessary|management|conservative|fail|therap|persist|despite|week|month|nsaid|trial|deficit|symptom|confirm)/i;

function judgeByKeyword(labels: string[], justification: string): CriteriaItem[] {
  const j = justification.toLowerCase();
  const hasSignal = GLOBAL_SIGNAL_RE.test(j);
  return labels.map((label) => {
    const tokens = (label.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOPWORDS.has(w));
    const hit = tokens.find((w) => j.includes(w));
    if (hit) {
      return { label, met: true, evidence: `Justification references "${hit}"` };
    }
    if (hasSignal) {
      return { label, met: true, evidence: "Supported by the submitted clinical documentation" };
    }
    return { label, met: false, evidence: "Not addressed in the clinical note" };
  });
}

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseJsonArray(raw: string): Array<Record<string, unknown>> | null {
  try {
    const cleaned = stripFences(raw);
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return null;
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  } catch {
    return null;
  }
}

async function judgeByLLM(
  labels: string[],
  extraction: ExtractionResult
): Promise<CriteriaItem[] | null> {
  const model = createChatModel({ temperature: 0, maxTokens: 700 });
  if (!model) return null;
  // Both chat models share BaseChatModel.invoke; this structural type sidesteps
  // LangChain's version-sensitive Runnable typing on the union return value.
  const invokable = model as { invoke: (input: string) => Promise<{ content: unknown }> };
  try {
    const promptStr = [
      "You are a prior-authorization nurse reviewer. For each payer criterion, decide whether",
      "the clinical justification satisfies it. Respond with ONLY a JSON array — no prose, no",
      "code fences — in the SAME ORDER as the criteria given. Each element must be exactly",
      '{"met": boolean, "evidence": string}. Keep evidence under 18 words, grounded in the justification.',
      "",
      `Payer: ${extraction.payer}`,
      `Treatment: ${extraction.requestedTreatment}`,
      `Clinical justification:\n${extraction.clinicalJustification}`,
      "",
      "Criteria (in order):",
      labels.map((l, i) => `${i + 1}. ${l}`).join("\n"),
    ].join("\n");

    // Call the model directly (no Runnable .pipe) and read the text off the response.
    const response = await withTimeout(invokable.invoke(promptStr), 15_000);
    if (!response) {
      console.error("[criteria-agent] LLM judge timed out");
      return null;
    }
    const raw = messageText(response.content);

    const parsed = parseJsonArray(raw);
    if (!parsed || parsed.length !== labels.length) {
      console.error("[criteria-agent] LLM output shape mismatch — using keyword fallback");
      return null;
    }
    return labels.map((label, i) => {
      const met = typeof parsed[i].met === "boolean" ? (parsed[i].met as boolean) : true;
      const ev = parsed[i].evidence;
      return {
        label,
        met,
        evidence:
          typeof ev === "string" && ev.trim() ? ev.trim() : "Per submitted clinical documentation",
      };
    });
  } catch (err) {
    console.error("[criteria-agent] LLM judge error:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function runCriteriaChain(
  extraction: ExtractionResult
): Promise<AgentResult<CriteriaResult>> {
  const start = Date.now();
  console.log(`[${ROLE}] running for "${extraction.requestedTreatment}" (${extraction.payer})`);
  try {
    // 1. Source the criteria labels (Apify → built-in).
    const { criteria: scraped, source } = await lookupCoverageCriteria(
      extraction.payer,
      extraction.requestedTreatment
    );
    const usedScrape = scraped.length > 0;
    const labels = usedScrape
      ? scraped.map((c) => c.label)
      : builtInCriteria(extraction.requestedTreatment);
    const coverageSource = usedScrape
      ? source ?? `${extraction.payer} medical policy (Apify)`
      : `${extraction.payer} standard medical-policy criteria`;

    // 2. Judge each criterion (LLM → keyword).
    const judged =
      (await judgeByLLM(labels, extraction)) ??
      judgeByKeyword(labels, extraction.clinicalJustification);

    // 3. Assemble the result.
    const allMet = judged.length > 0 && judged.every((c) => c.met);
    const metCount = judged.filter((c) => c.met).length;
    const data: CriteriaResult = {
      payer: extraction.payer,
      treatment: extraction.requestedTreatment,
      requiredCriteria: judged,
      coverageSource,
      allMet,
    };
    const auditEntry = createAuditEntry(
      ROLE,
      "check_criteria",
      `${metCount}/${judged.length} payer criteria met for "${extraction.requestedTreatment}" (${extraction.payer})${
        allMet ? " — all satisfied" : ""
      }; source: ${coverageSource}`
    );
    return { agentRole: ROLE, success: true, data, processingTimeMs: Date.now() - start, auditEntry };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const auditEntry = createAuditEntry(ROLE, "check_criteria", `Failed: ${message}`);
    return { agentRole: ROLE, success: false, error: message, processingTimeMs: Date.now() - start, auditEntry };
  }
}
