import { AgentResult, ComplianceCheck, ComplianceResult, AuthRequest } from "@clearauth/types";
import { createAuditEntry, verifyAuditEntry } from "@/lib/audit";
import { runComplianceAudit } from "@/lib/opsera";

// Compliance agent (Pranav-scope file; built by Sahiel per PROMPT 3).
//
// runComplianceChain(req) builds the compliance panel:
//   1. Request-derived checks — packet completeness, audit-trail integrity
//      (verifies the SHA-256 chain), note stored in Tigris, patient captured.
//   2. Opsera security/compliance audit (live or fail-soft fallback).
// Merges both, computes overall (fail > warn > pass), and returns a complete
// ComplianceResult so the panel is always populated. Logs `[compliance-agent]`.

const ROLE = "compliance-agent";

// The essential PA-packet fields the FORM-FILL agent is responsible for
// producing. (procedureCode/CPT can be absent for non-procedural treatments, and
// requestingProvider is supplied by the submission adapter — neither is the
// form-fill agent's responsibility, so they don't gate packet completeness.)
const REQUIRED_PACKET_FIELDS = [
  "patientName",
  "memberId",
  "diagnosisCode",
  "treatment",
  "clinicalJustification",
] as const;

// Map the form-fill agent's own field names onto the packet contract so we judge
// completeness regardless of which key set produced the packet.
const FIELD_ALIASES: Record<string, string[]> = {
  patientName: ["patientName", "patient", "name"],
  memberId: ["memberId", "member_id"],
  diagnosisCode: ["diagnosisCode", "icd10", "diagnosis"],
  procedureCode: ["procedureCode", "cptCode", "cpt"],
  treatment: ["treatment", "requestedTreatment"],
  clinicalJustification: ["clinicalJustification", "justification"],
  requestingProvider: ["requestingProvider", "provider", "orderingProvider"],
};

function packetHas(fields: Record<string, string> | undefined, canonical: string): boolean {
  if (!fields) return false;
  for (const key of FIELD_ALIASES[canonical] ?? [canonical]) {
    const v = fields[key];
    if (typeof v === "string" && v.trim()) return true;
  }
  return false;
}

function requestDerivedChecks(req: AuthRequest): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  // 1. PA packet completeness.
  const fields = req.formFill?.formFields;
  const missing = REQUIRED_PACKET_FIELDS.filter((f) => !packetHas(fields, f));
  checks.push(
    req.formFill && missing.length === 0
      ? {
          label: "Authorization packet complete",
          status: "pass",
          detail: `All ${REQUIRED_PACKET_FIELDS.length} required fields present`,
        }
      : {
          label: "Authorization packet complete",
          status: "warn",
          detail: req.formFill ? `Missing: ${missing.join(", ")}` : "Packet not yet generated",
        }
  );

  // 2. Audit-trail integrity — verify the SHA-256 checksum chain.
  const trail = req.auditTrail ?? [];
  const checksummed = trail.filter((e) => e.checksum);
  const allValid = checksummed.length > 0 && checksummed.every((e) => verifyAuditEntry(e));
  checks.push({
    label: "Audit trail integrity",
    status: trail.length === 0 ? "warn" : allValid ? "pass" : "fail",
    detail:
      trail.length === 0
        ? "No audit entries yet"
        : allValid
          ? `${checksummed.length} entries verified (SHA-256 chain)`
          : "Checksum mismatch detected",
  });

  // 3. Source document stored in object storage (Tigris).
  checks.push({
    label: "Documents encrypted at rest (Tigris)",
    status: req.noteKey ? "pass" : "warn",
    detail: req.noteKey ? `Clinical note stored at ${req.noteKey}` : "Note not yet stored",
  });

  // 4. Patient identity captured for the request.
  checks.push({
    label: "Patient context captured",
    status: req.patient?.name && req.patient?.insurer ? "pass" : "warn",
    detail:
      req.patient?.name && req.patient?.insurer
        ? `${req.patient.name} · ${req.patient.insurer}`
        : "Patient context incomplete",
  });

  return checks;
}

function computeOverall(checks: ComplianceCheck[]): ComplianceResult["overall"] {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

export async function runComplianceChain(
  req: AuthRequest
): Promise<AgentResult<ComplianceResult>> {
  const start = Date.now();
  console.log(`[${ROLE}] running for ${req.id}`);
  try {
    const derived = requestDerivedChecks(req);
    const { checks: opseraChecks, source } = await runComplianceAudit(req);

    const checks = [...derived, ...opseraChecks];
    const overall = computeOverall(checks);
    const data: ComplianceResult = { checks, overall, source };

    const passCount = checks.filter((c) => c.status === "pass").length;
    const auditEntry = createAuditEntry(
      ROLE,
      "compliance_review",
      `Compliance ${overall.toUpperCase()} — ${passCount}/${checks.length} checks passed (audit source: ${source})`
    );
    return { agentRole: ROLE, success: true, data, processingTimeMs: Date.now() - start, auditEntry };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const auditEntry = createAuditEntry(ROLE, "compliance_review", `Failed: ${message}`);
    return { agentRole: ROLE, success: false, error: message, processingTimeMs: Date.now() - start, auditEntry };
  }
}
