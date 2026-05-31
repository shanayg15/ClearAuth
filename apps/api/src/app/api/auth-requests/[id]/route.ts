import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, corsResponse } from "@/lib/cors";
import { getAuthRequest } from "@/lib/store";
import { getPresignedUrl } from "@/lib/tigris";

// Owner: Shanay. Fetch a single auth request by id, plus a short-lived presigned
// link to the stored raw note when Tigris is configured.

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
  // Presign the stored note for the dashboard; null when Tigris isn't configured.
  const noteUrl = request.noteKey ? await getPresignedUrl(request.noteKey) : null;
  return NextResponse.json({ request, noteUrl }, { headers: corsHeaders(origin) });
}
