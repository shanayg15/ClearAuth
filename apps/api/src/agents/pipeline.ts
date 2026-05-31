import { AgentResult, AuthRequest, AuthStatus } from "@clearauth/types";
import { upsertAuthRequest } from "@/lib/store";
import { createAuditEntry } from "@/lib/audit";
import { runExtractionChain } from "./chains/extraction-chain";
import { runCriteriaChain } from "./chains/criteria-chain";
import { runFormFillChain } from "./chains/formfill-chain";
import { runComplianceChain } from "./chains/compliance-chain";
import { runSubmissionChain } from "./chains/submission-chain";

// The agent pipeline: 5 chains run in sequence, persisting + broadcasting after
// every transition so connected dashboards animate live. Each step is wrapped so
// a chain failure flips status to "error" and stops — runPipeline never throws.

async function setStatus(req: AuthRequest, status: AuthStatus): Promise<void> {
  req.status = status;
  await upsertAuthRequest(req);
}

// Marks the in-progress status (live "working" update), runs the chain, appends
// its audit entry, and persists. Returns the AgentResult for the caller to read.
async function runStep<T>(
  req: AuthRequest,
  workingStatus: AuthStatus,
  run: () => Promise<AgentResult<T>>
): Promise<AgentResult<T>> {
  await setStatus(req, workingStatus);
  const result = await run();
  req.auditTrail.push(result.auditEntry);
  await upsertAuthRequest(req);
  return result;
}

async function fail(req: AuthRequest, message: string): Promise<AuthRequest> {
  console.error(`[pipeline] ${req.id} halted: ${message}`);
  req.status = "error";
  req.auditTrail.push(createAuditEntry("pipeline", "pipeline_error", message));
  await upsertAuthRequest(req);
  return req;
}

export async function runPipeline(req: AuthRequest): Promise<AuthRequest> {
  console.log(`[pipeline] starting ${req.id}`);
  try {
    // 1. Extraction — raw note → structured request
    const extraction = await runStep(req, "extracting", () => runExtractionChain(req.rawNote));
    if (!extraction.success || !extraction.data) return fail(req, extraction.error ?? "Extraction failed");
    const extractionData = extraction.data;
    req.extraction = extractionData;
    req.patient = extractionData.patient;

    // 2. Criteria — check request against payer coverage policy
    const criteria = await runStep(req, "checking_criteria", () => runCriteriaChain(extractionData));
    if (!criteria.success || !criteria.data) return fail(req, criteria.error ?? "Criteria check failed");
    const criteriaData = criteria.data;
    req.criteria = criteriaData;

    // 3. Form fill — assemble the payer PA packet
    const formFill = await runStep(req, "filling_form", () => runFormFillChain(extractionData, criteriaData));
    if (!formFill.success || !formFill.data) return fail(req, formFill.error ?? "Form fill failed");
    const formFillData = formFill.data;
    req.formFill = formFillData;

    // 4. Compliance — audit the packet before it leaves
    const compliance = await runStep(req, "compliance_review", () => runComplianceChain(req));
    if (!compliance.success || !compliance.data) return fail(req, compliance.error ?? "Compliance review failed");
    req.compliance = compliance.data;

    // Gate between review and submission
    await setStatus(req, "ready_to_submit");

    // 5. Submission — push the packet to the payer portal
    const submission = await runStep(req, "submitting", () =>
      runSubmissionChain(formFillData, extractionData.patient)
    );
    if (!submission.success || !submission.data) return fail(req, submission.error ?? "Submission failed");
    req.submission = submission.data;

    await setStatus(req, "submitted");
    console.log(`[pipeline] ${req.id} → submitted`);
    return req;
  } catch (err) {
    return fail(req, err instanceof Error ? err.message : String(err));
  }
}
