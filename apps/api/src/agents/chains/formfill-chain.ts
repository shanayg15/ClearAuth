import { AgentResult, CriteriaResult, ExtractionResult, FormFillResult } from "@clearauth/types";
import { createAuditEntry } from "@/lib/audit";
import { storeObject } from "@/lib/tigris";

// STUB (owner: pipeline). Builds the payer PA form fields + a human-readable
// packet, and stores the packet in object storage. Deterministic mock. Real
// impl: map fields to the specific payer form and render a full PDF/markdown.

const ROLE = "formfill-agent";

export async function runFormFillChain(
  extraction: ExtractionResult,
  criteria: CriteriaResult
): Promise<AgentResult<FormFillResult>> {
  const start = Date.now();
  console.log(`[${ROLE}] running (stub)`);
  try {
    const formFields: Record<string, string> = {
      patientName: extraction.patient.name,
      memberId: extraction.patient.memberId ?? "UNKNOWN",
      insurer: extraction.payer,
      diagnosis: extraction.diagnosis,
      icd10: extraction.icd10,
      requestedTreatment: extraction.requestedTreatment,
      cptCode: extraction.cptCode ?? "",
      clinicalJustification: extraction.clinicalJustification,
    };

    const packetMarkdown = [
      "# Prior Authorization Request",
      "",
      `**Patient:** ${extraction.patient.name}`,
      `**Member ID:** ${formFields.memberId}`,
      `**Insurer:** ${extraction.payer}`,
      "",
      "## Clinical Summary",
      `- **Diagnosis:** ${extraction.diagnosis} (${extraction.icd10})`,
      `- **Requested Treatment:** ${extraction.requestedTreatment}${extraction.cptCode ? ` (CPT ${extraction.cptCode})` : ""}`,
      "",
      "## Justification",
      extraction.clinicalJustification,
      "",
      "## Coverage Criteria",
      ...criteria.requiredCriteria.map(
        (c) => `- [${c.met ? "x" : " "}] ${c.label}${c.evidence ? ` — ${c.evidence}` : ""}`
      ),
    ].join("\n");

    const packetKey = `packets/${extraction.patient.patientId}-${Date.now()}.md`;
    await storeObject(packetKey, packetMarkdown, "text/markdown");

    const data: FormFillResult = { formFields, packetMarkdown, packetKey };
    const auditEntry = createAuditEntry(
      ROLE,
      "fill_form",
      `Generated PA packet for ${extraction.patient.name} (${Object.keys(formFields).length} fields), stored at ${packetKey}`
    );
    return { agentRole: ROLE, success: true, data, processingTimeMs: Date.now() - start, auditEntry };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const auditEntry = createAuditEntry(ROLE, "fill_form", `Failed: ${message}`);
    return { agentRole: ROLE, success: false, error: message, processingTimeMs: Date.now() - start, auditEntry };
  }
}
