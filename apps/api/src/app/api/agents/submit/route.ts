import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, corsResponse } from "@/lib/cors";
import { getAuthRequest, upsertAuthRequest } from "@/lib/store";
import { runSubmissionChain } from "@/agents/chains/submission-chain";

// Owner: Sahiel. Re-triggers a Rtrvr submission for an existing request,
// independently of the full pipeline (lets the dashboard "Submit" button fire a
// fresh submission for the demo). Pushes live SSE updates: submitting → submitted.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const body = await req.json().catch(() => ({}));
    const id: string = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400, headers: corsHeaders(origin) });
    }

    const existing = await getAuthRequest(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders(origin) });
    }
    if (!existing.formFill || !existing.patient) {
      return NextResponse.json(
        { error: "Request is not ready to submit — run the pipeline first" },
        { status: 409, headers: corsHeaders(origin) }
      );
    }

    // Live "submitting" tick before the (possibly slow) agent call.
    existing.status = "submitting";
    await upsertAuthRequest(existing);

    const result = await runSubmissionChain(existing.formFill, existing.patient);
    existing.auditTrail.push(result.auditEntry);

    if (!result.success || !result.data) {
      existing.status = "error";
      await upsertAuthRequest(existing);
      return NextResponse.json(
        { error: result.error ?? "Submission failed", request: existing },
        { status: 502, headers: corsHeaders(origin) }
      );
    }

    existing.submission = result.data;
    existing.status = "submitted";
    await upsertAuthRequest(existing);

    return NextResponse.json({ request: existing }, { headers: corsHeaders(origin) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders(origin) });
  }
}
