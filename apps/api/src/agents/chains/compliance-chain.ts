import { AgentResult, AuthRequest, ComplianceResult } from "@clearauth/types";
import { createAuditEntry } from "@/lib/audit";
import { runComplianceAudit } from "@/lib/opsera";

// STUB (owner: Pranav). Runs a compliance audit over the whole request before
// submission (delegates to the Opsera integration lib). Deterministic mock that
// passes. Real impl: call Opsera MCP and map findings to ComplianceResult.

const ROLE = "compliance-agent";

export async function runComplianceChain(req: AuthRequest): Promise<AgentResult<ComplianceResult>> {
  const start = Date.now();
  console.log(`[${ROLE}] running (stub)`);
  try {
    const data = await runComplianceAudit(req);
    const auditEntry = createAuditEntry(
      ROLE,
      "compliance_review",
      `Compliance ${data.overall.toUpperCase()} via ${data.source} (${data.checks.length} checks)`
    );
    return { agentRole: ROLE, success: true, data, processingTimeMs: Date.now() - start, auditEntry };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const auditEntry = createAuditEntry(ROLE, "compliance_review", `Failed: ${message}`);
    return { agentRole: ROLE, success: false, error: message, processingTimeMs: Date.now() - start, auditEntry };
  }
}
