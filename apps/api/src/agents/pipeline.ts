import { AgentResult, AuthRequest, AuthStatus } from "@clearauth/types";
import { upsertAuthRequest } from "@/lib/store";
import { createAuditEntry } from "@/lib/audit";
import { runExtractionChain } from "./chains/extraction-chain";
import { runCriteriaChain } from "./chains/criteria-chain";
import { runFormFillChain } from "./chains/formfill-chain";
import { runComplianceChain } from "./chains/compliance-chain";

// The agent pipeline: the 4 autonomous chains (extraction → criteria → form-fill →
// compliance) run in sequence, persisting + broadcasting after every transition so
// connected dashboards animate live. The pipeline then STOPS at "ready_to_submit" —
// a deliberate human-in-the-loop gate. The doctor reviews the completed packet in
// the CRM and approves; that approval triggers the 5th chain (submission) via
// POST /api/agents/submit. Each step is wrapped so a chain failure flips status to
// "error" and stops — runPipeline never throws.

// Demo pacing: with DEMO_PACING=1, insert a short beat before each transition so
// the live status animation is watchable. Off by default (zero delay in tests/CI).
const PACE_MS = 600;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function pace(): Promise<void> {
  if (process.env.DEMO_PACING === "1") await sleep(PACE_MS);
}

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
  await pace();
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

    // 3. Form fill — assemble the payer PA packet (packet stored at packets/{id}.md)
    const formFill = await runStep(req, "filling_form", () =>
      runFormFillChain(extractionData, criteriaData, req.id)
    );
    if (!formFill.success || !formFill.data) return fail(req, formFill.error ?? "Form fill failed");
    const formFillData = formFill.data;
    req.formFill = formFillData;

    // 4. Compliance — audit the packet before it leaves
    const compliance = await runStep(req, "compliance_review", () => runComplianceChain(req));
    if (!compliance.success || !compliance.data) return fail(req, compliance.error ?? "Compliance review failed");
    req.compliance = compliance.data;

    // Human-in-the-loop gate. The autonomous agents are done; the pipeline stops
    // here and waits. The doctor reviews the completed packet in the CRM and clicks
    // "Approve & Submit", which POSTs to /api/agents/submit to run the submission
    // chain (submitting → submitted). Nothing leaves for the payer without that
    // explicit human approval — the AI proposes, the clinician signs off.
    await pace();
    await setStatus(req, "ready_to_submit");
    console.log(`[pipeline] ${req.id} → ready_to_submit (awaiting doctor approval)`);
    return req;
  } catch (err) {
    return fail(req, err instanceof Error ? err.message : String(err));
  }
}
