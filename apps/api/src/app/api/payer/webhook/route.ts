import { NextRequest, NextResponse } from "next/server";
import { AuthStatus } from "@clearauth/types";
import { corsHeaders, corsResponse } from "@/lib/cors";
import { getAuthRequest, upsertAuthRequest } from "@/lib/store";
import { createAuditEntry } from "@/lib/audit";

// STUB (owner: Sahiel). Payer callback that advances a request to its decision
// state (under_review / approved / denied) given { id, status }. Real impl:
// verify the payer signature before trusting the payload.

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const body = await req.json().catch(() => ({}));
    const id: string = typeof body.id === "string" ? body.id : "";
    const status = body.status as AuthStatus | undefined;
    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400, headers: corsHeaders(origin) });
    }

    const existing = await getAuthRequest(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders(origin) });
    }

    existing.status = status;
    existing.auditTrail.push(createAuditEntry("payer-webhook", "status_update", `Payer set status to ${status}`));
    await upsertAuthRequest(existing);

    return NextResponse.json({ request: existing }, { headers: corsHeaders(origin) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders(origin) });
  }
}
