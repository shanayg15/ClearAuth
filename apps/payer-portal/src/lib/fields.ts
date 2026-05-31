// Canonical payer-portal form fields (owner: Sahiel).
// These names mirror what the Rtrvr integration submits (see apps/api/src/lib/rtrvr.ts
// normalizeFields). The /submit <form> renders inputs named EXACTLY these.

export type PortalField = {
  name: string;
  label: string;
  placeholder: string;
  textarea?: boolean;
};

export const PORTAL_FIELDS: PortalField[] = [
  { name: "patientName", label: "Patient Name", placeholder: "Jane Doe" },
  { name: "memberId", label: "Member ID", placeholder: "W123456789" },
  { name: "diagnosisCode", label: "Diagnosis Code (ICD-10)", placeholder: "M54.5" },
  { name: "procedureCode", label: "Procedure Code (CPT)", placeholder: "72148" },
  { name: "treatment", label: "Requested Treatment / Service", placeholder: "MRI lumbar spine without contrast" },
  { name: "requestingProvider", label: "Requesting Provider", placeholder: "Dr. A. Smith, MD" },
  {
    name: "clinicalJustification",
    label: "Clinical Justification",
    placeholder: "Persistent radicular symptoms despite 8 weeks of conservative management.",
    textarea: true,
  },
];

export const FIELD_NAMES = PORTAL_FIELDS.map((f) => f.name);

// Accept the pipeline's own key names too, so a fallback POST that forwards raw
// formFields still maps onto the canonical inputs.
const ALIASES: Record<string, string> = {
  name: "patientName",
  patient: "patientName",
  member_id: "memberId",
  icd10: "diagnosisCode",
  diagnosis_code: "diagnosisCode",
  cptCode: "procedureCode",
  cpt: "procedureCode",
  procedure_code: "procedureCode",
  requestedTreatment: "treatment",
  procedure: "treatment",
  provider: "requestingProvider",
  orderingProvider: "requestingProvider",
  justification: "clinicalJustification",
};

export function normalizeIntake(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(input)) {
    if (rawVal == null) continue;
    const key = ALIASES[rawKey] ?? rawKey;
    if (FIELD_NAMES.includes(key)) {
      const v = String(rawVal).trim();
      if (v) out[key] = v;
    }
  }
  return out;
}
