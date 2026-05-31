import { SubmissionResult } from "@clearauth/types";

// Rtrvr.ai web-agent submission integration.
// STUB (owner: Sahiel). Returns a deterministic fallback confirmation with no
// network. Real impl: submit `fields` to `portalUrl` via the Rtrvr API
// (method "rtrvr_api") or the scripted browser flow (method "rtrvr_trick").

export async function submitToPortal(
  portalUrl: string,
  fields: Record<string, string>
): Promise<{ confirmationId?: string; method: SubmissionResult["method"] }> {
  console.log(`[rtrvr] stub submitToPortal url=${portalUrl} fields=${Object.keys(fields).length}`);
  try {
    const confirmationId = `PA-${Date.now().toString(36).toUpperCase()}`;
    return { confirmationId, method: "fallback" };
  } catch (err) {
    console.error("[rtrvr] stub submitToPortal error:", err);
    return { method: "fallback" };
  }
}
