import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, corsResponse } from "@/lib/cors";
import { getAuthRequest } from "@/lib/store";

// Owner: Shanay. Fetch a single auth request by id.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req.headers.get("origin"));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get("origin");
  const { id } = await params;
  const request = await getAuthRequest(id);
  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders(origin) });
  }
  return NextResponse.json({ request }, { headers: corsHeaders(origin) });
}
