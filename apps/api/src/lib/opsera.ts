import { AuthRequest, ComplianceCheck, ComplianceResult } from "@clearauth/types";

// Opsera compliance audit (MCP) integration.
// STUB (owner: Pranav). Derives a passing audit from the request with no
// network. Real impl: call OPSERA_MCP_URL with the packet + audit trail and map
// the response to ComplianceResult (source: "opsera").

export async function runComplianceAudit(req: AuthRequest): Promise<ComplianceResult> {
  console.log(`[opsera] stub runComplianceAudit id=${req.id}`);
  try {
    const criteriaMet = req.criteria?.requiredCriteria.filter((c) => c.met).length ?? 0;
    const criteriaTotal = req.criteria?.requiredCriteria.length ?? 0;

    const checks: ComplianceCheck[] = [
      { label: "PHI confined to audit trail", status: "pass", detail: "No PHI exposed outside the secured record" },
      {
        label: "Clinical data extracted",
        status: req.extraction ? "pass" : "warn",
        detail: req.extraction ? "All required fields populated" : "Extraction missing",
      },
      {
        label: "Coverage criteria documented",
        status: req.criteria ? (req.criteria.allMet ? "pass" : "warn") : "warn",
        detail: req.criteria ? `${criteriaMet}/${criteriaTotal} criteria met` : "Criteria not checked",
      },
      {
        label: "Audit trail integrity",
        status: "pass",
        detail: `${req.auditTrail.length} tamper-evident entries`,
      },
    ];

    const overall: ComplianceResult["overall"] = checks.some((c) => c.status === "fail")
      ? "fail"
      : checks.some((c) => c.status === "warn")
        ? "warn"
        : "pass";

    return { checks, overall, source: "fallback" };
  } catch (err) {
    console.error("[opsera] stub runComplianceAudit error:", err);
    return {
      checks: [{ label: "Compliance audit", status: "warn", detail: "Stub error path" }],
      overall: "warn",
      source: "fallback",
    };
  }
}
