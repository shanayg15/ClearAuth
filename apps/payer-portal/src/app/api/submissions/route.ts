import { NextResponse } from "next/server";
import { listSubmissions } from "@/lib/store";

// Lists received submissions for the /control operator console.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { submissions: listSubmissions() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
