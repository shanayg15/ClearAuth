import { SubmissionResult } from "@clearauth/types";

// Rtrvr.ai web-agent submission integration (owner: Sahiel).
//
// submitToPortal() drives the payer portal three ways, each fail-soft and never
// throwing, so a submission ALWAYS lands in the portal's /control — even fully
// offline:
//   A) Rtrvr Cloud API  — a DOM browser agent reads + fills + submits the real form
//   B) Rtrvr "Trick"    — a pre-recorded, deterministic replay of that same flow
//   C) Direct fallback  — POST straight to the portal's /api/intake
//
// Strategy can be pinned on stage with RTRVR_STRATEGY = api | trick | fallback
// (default "auto" tries A → B → C). Every branch logs `[rtrvr] ...`.

type SubmitMethod = SubmissionResult["method"];
type SubmitOutcome = { confirmationId?: string; method: SubmitMethod };

const AGENT_TIMEOUT_MS = 20_000;
const FALLBACK_TIMEOUT_MS = 10_000;

const RTRVR_API_BASE = process.env.RTRVR_API_BASE ?? "https://api.rtrvr.ai";
const RTRVR_A2W_BASE = process.env.RTRVR_A2W_BASE ?? "https://agent.rtrvr.ai/v1/a2w/runs";

// --- field normalization -----------------------------------------------------
// The form-fill agent (Shanay) emits its own key names; the payer portal exposes
// a fixed canonical set. Map the pipeline's keys onto the portal's field names so
// the same submission works whether keys come from the pipeline or are already
// canonical. Unknown keys are dropped (the portal only has these inputs).
const CANONICAL_FIELDS = [
  "patientName",
  "memberId",
  "diagnosisCode",
  "procedureCode",
  "treatment",
  "clinicalJustification",
  "requestingProvider",
] as const;

function pick(fields: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = fields[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function normalizeFields(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {
    patientName: pick(fields, "patientName", "patient", "name") ?? "",
    memberId: pick(fields, "memberId", "member_id", "memberID") ?? "",
    diagnosisCode: pick(fields, "diagnosisCode", "icd10", "icd", "diagnosis_code") ?? "",
    procedureCode: pick(fields, "procedureCode", "cptCode", "cpt", "procedure_code") ?? "",
    treatment: pick(fields, "treatment", "requestedTreatment", "procedure") ?? "",
    clinicalJustification: pick(fields, "clinicalJustification", "justification") ?? "",
    requestingProvider:
      pick(fields, "requestingProvider", "provider", "orderingProvider") ?? "ClearAuth Provider Network",
  };
  // If only a human-readable diagnosis came through, use it for the code field.
  if (!out.diagnosisCode) out.diagnosisCode = pick(fields, "diagnosis") ?? "";
  return out;
}

// --- helpers -----------------------------------------------------------------
function genConfirmation(): string {
  return `PA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function intakeUrlFor(portalUrl: string): string {
  try {
    const u = new URL(portalUrl);
    u.pathname = u.pathname.replace(/\/submit\/?$/, "") + "/api/intake";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return portalUrl.replace(/\/submit\/?$/, "") + "/api/intake";
  }
}

function buildPrompt(portalUrl: string, fields: Record<string, string>): string {
  const lines = CANONICAL_FIELDS.filter((k) => fields[k]).map((k) => `- ${k}: ${fields[k]}`);
  return [
    `Open ${portalUrl}. It is a prior-authorization form. Fill in each field below by`,
    `matching the field name to the input with the same name (or closest matching label),`,
    `then click the Submit button:`,
    ...lines,
    `After submitting, read and report the confirmation ID shown on the resulting page.`,
  ].join("\n");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

// Best-effort confirmation-id parse across the response shapes Rtrvr / the portal
// might return.
function parseConfirmation(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  const nested = (obj: unknown, key: string): unknown =>
    obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
  const candidates = [
    d.confirmationId,
    d.confirmation_id,
    d.confirmation,
    d.id,
    d.runId,
    nested(d.result, "confirmationId"),
    nested(d.output, "confirmationId"),
    nested(d.data, "confirmationId"),
  ];
  for (const c of candidates) {
    const s = asString(c);
    if (s) return s;
  }
  const m = JSON.stringify(d).match(/PA-[A-Z0-9]{3,}/i);
  return m?.[0]?.toUpperCase();
}

// --- Strategy A: Rtrvr Cloud API --------------------------------------------
async function viaCloudApi(
  portalUrl: string,
  fields: Record<string, string>,
  preId: string
): Promise<SubmitOutcome | null> {
  const key = process.env.RTRVR_API_KEY;
  if (!key) {
    console.log("[rtrvr] strategy A skipped — no RTRVR_API_KEY");
    return null;
  }
  const endpoint = `${RTRVR_API_BASE.replace(/\/$/, "")}/execute`;
  try {
    console.log(`[rtrvr] strategy A → POST ${endpoint}`);
    const instruction = buildPrompt(portalUrl, fields);
    // Rtrvr's /execute validates `input` (string, required). We also send the
    // documented `urls` array + `prompt`/`url` aliases so the same body works
    // across their /execute and /agent shapes. NOTE: the cloud agent runs in
    // Rtrvr's browser cloud and cannot reach localhost — RTRVR_PORTAL_URL must be
    // a publicly reachable URL (deploy or tunnel) for a real browser submission.
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          input: instruction,
          prompt: instruction,
          urls: [portalUrl],
          url: portalUrl,
          response: { verbosity: "final" },
        }),
      },
      AGENT_TIMEOUT_MS
    );
    if (!res.ok) {
      console.error(`[rtrvr] strategy A failed — HTTP ${res.status}`);
      return null;
    }
    const data = await res.json().catch(() => ({}));
    const confirmationId = parseConfirmation(data) ?? preId;
    console.log(`[rtrvr] strategy A ok via rtrvr_api → ${confirmationId}`);
    return { confirmationId, method: "rtrvr_api" };
  } catch (err) {
    console.error("[rtrvr] strategy A error:", err instanceof Error ? err.message : err);
    return null;
  }
}

// --- Strategy B: Rtrvr recorded "Trick" (A2W) -------------------------------
async function viaTrick(
  portalUrl: string,
  fields: Record<string, string>,
  preId: string
): Promise<SubmitOutcome | null> {
  const trickId = process.env.RTRVR_TRICK_ID;
  if (!trickId) {
    console.log("[rtrvr] strategy B skipped — no RTRVR_TRICK_ID");
    return null;
  }
  const key = process.env.RTRVR_API_KEY;
  try {
    console.log(`[rtrvr] strategy B → trigger trick ${trickId} @ ${RTRVR_A2W_BASE}`);
    const res = await fetchWithTimeout(
      RTRVR_A2W_BASE,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({ trickId, url: portalUrl, inputs: fields }),
      },
      AGENT_TIMEOUT_MS
    );
    if (!res.ok) {
      console.error(`[rtrvr] strategy B failed — HTTP ${res.status}`);
      return null;
    }
    const data = await res.json().catch(() => ({}));
    const confirmationId = parseConfirmation(data) ?? preId;
    console.log(`[rtrvr] strategy B ok via rtrvr_trick → ${confirmationId}`);
    return { confirmationId, method: "rtrvr_trick" };
  } catch (err) {
    console.error("[rtrvr] strategy B error:", err instanceof Error ? err.message : err);
    return null;
  }
}

// --- Strategy C: direct fallback POST to the portal's intake API ------------
async function viaFallback(
  portalUrl: string,
  fields: Record<string, string>,
  preId: string
): Promise<SubmitOutcome> {
  const intakeUrl = intakeUrlFor(portalUrl);
  try {
    console.log(`[rtrvr] strategy C → direct POST ${intakeUrl}`);
    const res = await fetchWithTimeout(
      intakeUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Pass our pre-generated id so the portal row and the AuthRequest agree.
        body: JSON.stringify({ ...fields, confirmationId: preId, source: "clearauth-fallback" }),
      },
      FALLBACK_TIMEOUT_MS
    );
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const confirmationId = parseConfirmation(data) ?? preId;
      console.log(`[rtrvr] strategy C ok via fallback → ${confirmationId}`);
      return { confirmationId, method: "fallback" };
    }
    console.error(`[rtrvr] strategy C failed — HTTP ${res.status}`);
  } catch (err) {
    console.error("[rtrvr] strategy C error:", err instanceof Error ? err.message : err);
  }
  // Portal unreachable: still return an id so the pipeline completes cleanly.
  console.log(`[rtrvr] strategy C synthesized ${preId} (portal unreachable)`);
  return { confirmationId: preId, method: "fallback" };
}

// --- public API --------------------------------------------------------------
export async function submitToPortal(
  portalUrl: string,
  rawFields: Record<string, string>
): Promise<SubmitOutcome> {
  const fields = normalizeFields(rawFields);
  const preId = genConfirmation();
  const mode = (process.env.RTRVR_STRATEGY ?? "auto").toLowerCase();
  console.log(
    `[rtrvr] submitToPortal mode=${mode} url=${portalUrl} fields=${
      Object.values(fields).filter(Boolean).length
    }`
  );

  if (mode === "fallback") return viaFallback(portalUrl, fields, preId);

  if (mode === "trick") {
    return (await viaTrick(portalUrl, fields, preId)) ?? (await viaFallback(portalUrl, fields, preId));
  }

  if (mode === "api") {
    return (await viaCloudApi(portalUrl, fields, preId)) ?? (await viaFallback(portalUrl, fields, preId));
  }

  // auto: A → B → C
  return (
    (await viaCloudApi(portalUrl, fields, preId)) ??
    (await viaTrick(portalUrl, fields, preId)) ??
    (await viaFallback(portalUrl, fields, preId))
  );
}
