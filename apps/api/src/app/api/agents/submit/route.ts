import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, corsResponse } from "@/lib/cors";

// STUB (owner: Sahiel). Will trigger a real Rtrvr submission for a request that
// is already ready_to_submit. For now it acknowledges so the dashboard's
// "Submit" button works end-to-end. Wire up @/lib/rtrvr + the store here.

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const body = await req.json().catch(() => ({}));
  console.log("[agents/submit] stub invoked", body);
  return NextResponse.json(
    { ok: true, stub: true, message: "submit stub — wire up Rtrvr submission here" },
    { headers: corsHeaders(origin) }
  );
}
