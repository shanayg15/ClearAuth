import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, corsResponse } from "@/lib/cors";
import { validateToken } from "@/lib/auth";
import { getAuthRequest } from "@/lib/store";
import { runPipeline } from "@/agents/pipeline";

// Owner: Shanay. Kicks off the agent pipeline for an existing request and
// returns the final state. Live progress streams over /api/stream meanwhile.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  validateToken(req.headers.get("authorization"));
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

    const result = await runPipeline(existing);
    return NextResponse.json({ request: result }, { headers: corsHeaders(origin) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders(origin) });
  }
}
