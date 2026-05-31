import { AgentResult, FormFillResult, PatientContext, SubmissionResult } from "@clearauth/types";
import { createAuditEntry } from "@/lib/audit";
import { submitToPortal } from "@/lib/rtrvr";

// STUB (owner: Sahiel). Submits the completed packet to the payer portal
// (delegates to the Rtrvr integration lib). Deterministic mock returning a
// fallback confirmation. Real impl: drive the portal via Rtrvr.ai.

const ROLE = "submission-agent";

export async function runSubmissionChain(
  formFill: FormFillResult,
  patient: PatientContext
): Promise<AgentResult<SubmissionResult>> {
  const start = Date.now();
  console.log(`[${ROLE}] running (stub)`);
  try {
    const portalUrl = process.env.RTRVR_PORTAL_URL ?? "http://localhost:3009/submit";
    const { confirmationId, method } = await submitToPortal(portalUrl, formFill.formFields);
    const data: SubmissionResult = {
      portalUrl,
      ...(confirmationId ? { confirmationId } : {}),
      method,
      submittedAt: new Date().toISOString(),
    };
    const auditEntry = createAuditEntry(
      ROLE,
      "submit_to_payer",
      `Submitted to ${patient.insurer} via ${method}${confirmationId ? `, confirmation ${confirmationId}` : ""}`
    );
    return { agentRole: ROLE, success: true, data, processingTimeMs: Date.now() - start, auditEntry };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const auditEntry = createAuditEntry(ROLE, "submit_to_payer", `Failed: ${message}`);
    return { agentRole: ROLE, success: false, error: message, processingTimeMs: Date.now() - start, auditEntry };
  }
}
