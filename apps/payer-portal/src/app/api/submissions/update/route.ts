import { NextRequest, NextResponse } from "next/server";
import { setSubmissionStatus, type PortalStatus } from "@/lib/store";

// Reflects an operator decision in the portal's own store so the console updates
// immediately (the authoritative live flip happens on the ClearAuth side via the
// payer webhook).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: PortalStatus[] = ["Received", "Under Review", "Approved", "Denied"];

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const confirmationId = typeof body.confirmationId === "string" ? body.confirmationId : "";
  const status = body.status as PortalStatus;

  if (!confirmationId || !VALID.includes(status)) {
    return NextResponse.json(
      { error: "confirmationId and a valid status are required" },
      { status: 400 }
    );
  }

  const submission = setSubmissionStatus(confirmationId, status);
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ submission });
}
