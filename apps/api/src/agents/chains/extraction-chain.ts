import { AgentResult, ExtractionResult, PatientContext } from "@clearauth/types";
import { createAuditEntry } from "@/lib/audit";

// STUB (owner: pipeline). Parses a raw clinical note into structured PA data.
// Returns a deterministic mock derived from the note so the pipeline runs with
// no API key. Real impl: `const model = createChatModel()` then prompt + zod.

const ROLE = "extraction-agent";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "patient";
}

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

export async function runExtractionChain(rawNote: string): Promise<AgentResult<ExtractionResult>> {
  const start = Date.now();
  console.log(`[${ROLE}] running (stub)`);
  try {
    const data = deriveFromNote(rawNote);
    const auditEntry = createAuditEntry(
      ROLE,
      "extract_clinical_data",
      `Extracted "${data.diagnosis}" (${data.icd10}) → "${data.requestedTreatment}" for ${data.patient.name} / ${data.payer}`
    );
    return { agentRole: ROLE, success: true, data, processingTimeMs: Date.now() - start, auditEntry };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const auditEntry = createAuditEntry(ROLE, "extract_clinical_data", `Failed: ${message}`);
    return { agentRole: ROLE, success: false, error: message, processingTimeMs: Date.now() - start, auditEntry };
  }
}
