import { AgentResult, CriteriaResult, ExtractionResult } from "@clearauth/types";
import { createAuditEntry } from "@/lib/audit";
import { lookupCoverageCriteria } from "./apify-coverage";

// STUB (owner: pipeline). Checks the extracted request against payer coverage
// criteria (sourced via apify-coverage). Deterministic mock that always
// resolves so the pipeline advances. Real impl: reason over note + scraped
// policy with an LLM to decide which criteria are actually met.

const ROLE = "criteria-agent";

export async function runCriteriaChain(
  extraction: ExtractionResult
): Promise<AgentResult<CriteriaResult>> {
  const start = Date.now();
  console.log(`[${ROLE}] running (stub)`);
  try {
    const { criteria, source } = await lookupCoverageCriteria(
      extraction.payer,
      extraction.requestedTreatment
    );
    const allMet = criteria.length > 0 && criteria.every((c) => c.met);
    const data: CriteriaResult = {
      payer: extraction.payer,
      treatment: extraction.requestedTreatment,
      requiredCriteria: criteria,
      ...(source ? { coverageSource: source } : {}),
      allMet,
    };
    const auditEntry = createAuditEntry(
      ROLE,
      "check_criteria",
      `${criteria.filter((c) => c.met).length}/${criteria.length} criteria met for "${extraction.requestedTreatment}" (${extraction.payer})`
    );
    return { agentRole: ROLE, success: true, data, processingTimeMs: Date.now() - start, auditEntry };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const auditEntry = createAuditEntry(ROLE, "check_criteria", `Failed: ${message}`);
    return { agentRole: ROLE, success: false, error: message, processingTimeMs: Date.now() - start, auditEntry };
  }
}
