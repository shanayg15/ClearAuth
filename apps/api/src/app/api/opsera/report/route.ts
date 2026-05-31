import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, corsResponse } from "@/lib/cors";
import { getAuthRequest } from "@/lib/store";
import { runOpseraReport } from "@/lib/opsera";

// Opsera narrative-agent endpoint (built by Sahiel).
// POST { id } → runs the Architecture Analyzer + Business Documents Generator
// agents and returns their report sections (the investor-pitch / HIPAA-summary
// artifacts). Fail-soft: always returns a deterministic report. Read-only — it
// does not mutate the request, so it never disturbs the live pipeline.

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

    const report = await runOpseraReport(existing);
    return NextResponse.json({ report }, { headers: corsHeaders(origin) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders(origin) });
  }
}
