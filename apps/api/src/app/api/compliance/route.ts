import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, corsResponse } from "@/lib/cors";
import { getAuthRequest, upsertAuthRequest } from "@/lib/store";
import { runComplianceChain } from "@/agents/chains/compliance-chain";

// Compliance endpoint (Pranav-scope file; built by Sahiel per PROMPT 3).
// POST { id } → run the compliance chain on demand, merge the result into the
// request, append its audit entry, persist (which broadcasts a live SSE update),
// and return the updated request so the panel can refresh independently.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const result = await runComplianceChain(existing);
    existing.auditTrail.push(result.auditEntry);
    if (result.success && result.data) {
      existing.compliance = result.data;
    }
    await upsertAuthRequest(existing);

    return NextResponse.json(
      { request: existing, compliance: existing.compliance },
      { headers: corsHeaders(origin) }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders(origin) });
  }
}
