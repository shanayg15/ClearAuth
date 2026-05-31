import { AgentResult, FormFillResult, PatientContext, SubmissionResult } from "@clearauth/types";
import { createAuditEntry } from "@/lib/audit";
import { submitToPortal } from "@/lib/rtrvr";

// Submission agent (owner: Sahiel) — the "agent that acts".
//
// Hands the filled PA packet to the Rtrvr integration, which fills + submits the
// payer portal form (or falls back so a submission always lands). Builds a
// SubmissionResult and an audit entry describing what the agent did and how.
// Logs `[submission-agent] ...`.

const ROLE = "submission-agent";

const METHOD_LABEL: Record<SubmissionResult["method"], string> = {
  rtrvr_api: "Rtrvr.ai cloud browser agent",
  rtrvr_trick: "Rtrvr.ai recorded Trick",
  fallback: "direct portal submission",
};

export async function runSubmissionChain(
  formFill: FormFillResult,
  patient: PatientContext
): Promise<AgentResult<SubmissionResult>> {
  const start = Date.now();
  console.log(`[${ROLE}] running for ${patient.name} / ${patient.insurer}`);
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
      `Filled and submitted the prior-authorization form to ${patient.insurer} at ${portalUrl} via ${METHOD_LABEL[method]}${
        confirmationId ? `; payer confirmation ${confirmationId}` : ""
      }`
    );
    console.log(`[${ROLE}] submitted via ${method}${confirmationId ? ` (${confirmationId})` : ""}`);
    return { agentRole: ROLE, success: true, data, processingTimeMs: Date.now() - start, auditEntry };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const auditEntry = createAuditEntry(ROLE, "submit_to_payer", `Failed: ${message}`);
    return { agentRole: ROLE, success: false, error: message, processingTimeMs: Date.now() - start, auditEntry };
  }
}
