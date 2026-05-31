import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { AuthRequest } from "@clearauth/types";
import { corsHeaders, corsResponse } from "@/lib/cors";
import { validateToken } from "@/lib/auth";
import { listAuthRequests, upsertAuthRequest } from "@/lib/store";
import { storeObject } from "@/lib/tigris";

// Owner: Shanay. List all auth requests + create a new one from a raw note.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req.headers.get("origin"));
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const requests = await listAuthRequests();
  return NextResponse.json({ requests }, { headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const user = validateToken(req.headers.get("authorization"));
  try {
    const body = await req.json().catch(() => ({}));
    const rawNote: string = typeof body.rawNote === "string" ? body.rawNote : "";
    if (!rawNote.trim()) {
      return NextResponse.json({ error: "rawNote is required" }, { status: 400, headers: corsHeaders(origin) });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const noteKey = `notes/${id}.txt`;
    await storeObject(noteKey, rawNote, "text/plain");

    const request: AuthRequest = {
      id,
      status: "intake",
      createdAt: now,
      updatedAt: now,
      uploadedBy: user.userId,
      noteKey,
      rawNote,
      auditTrail: [],
    };
    await upsertAuthRequest(request);

    return NextResponse.json({ request }, { status: 201, headers: corsHeaders(origin) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders(origin) });
  }
}
