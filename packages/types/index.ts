// ClearAuth shared type contract.
// Every team member imports from "@clearauth/types". Do not change a shared
// interface without telling the team — other people's code depends on them.

export type AuthStatus =
  | "intake"
  | "extracting"
  | "checking_criteria"
  | "filling_form"
  | "compliance_review"
  | "ready_to_submit"
  | "submitting"
  | "submitted"
  | "under_review"
  | "approved"
  | "denied"
  | "error";

export interface PatientContext {
  patientId: string;
  name: string;
  dob?: string;
  age?: number;
  sex?: string;
  insurer: string;
  memberId?: string;
}

export interface ExtractionResult {
  diagnosis: string;
  icd10: string;
  requestedTreatment: string;
  cptCode?: string;
  clinicalJustification: string;
  payer: string;
  patient: PatientContext;
}

export interface CriteriaItem {
  label: string;
  met: boolean;
  evidence?: string;
}

export interface CriteriaResult {
  payer: string;
  treatment: string;
  requiredCriteria: CriteriaItem[];
  coverageSource?: string;
  allMet: boolean;
}

export interface FormFillResult {
  formFields: Record<string, string>;
  packetMarkdown: string;
  packetKey?: string;
}

export interface ComplianceCheck {
  label: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
}

export interface ComplianceResult {
  checks: ComplianceCheck[];
  overall: "pass" | "warn" | "fail";
  source: "opsera" | "fallback";
}

export interface SubmissionResult {
  portalUrl: string;
  confirmationId?: string;
  method: "rtrvr_api" | "rtrvr_trick" | "fallback";
  submittedAt: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  agentRole: string;
  action: string;
  details: string;
  checksum?: string;
}

export interface AuthRequest {
  id: string;
  status: AuthStatus;
  createdAt: string;
  updatedAt: string;
  uploadedBy: string;
  noteKey?: string;
  rawNote: string;
  patient?: PatientContext;
  extraction?: ExtractionResult;
  criteria?: CriteriaResult;
  formFill?: FormFillResult;
  compliance?: ComplianceResult;
  submission?: SubmissionResult;
  auditTrail: AuditEntry[];
}

export interface AgentResult<T> {
  agentRole: string;
  success: boolean;
  data?: T;
  error?: string;
  processingTimeMs: number;
  auditEntry: AuditEntry;
}
