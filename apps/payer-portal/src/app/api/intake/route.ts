import { NextRequest, NextResponse } from "next/server";
import { addSubmission } from "@/lib/store";
import { normalizeIntake } from "@/lib/fields";

// The payer portal's intake endpoint. Handles BOTH:
//   - native <form> POSTs (application/x-www-form-urlencoded / multipart) → 303
//     redirect to the confirmation page (works with no client JS, so a DOM agent
//     that just clicks "submit" lands on a real confirmation page), and
//   - JSON POSTs (the ClearAuth fallback strategy) → JSON { confirmationId }.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  let input: Record<string, unknown> = {};
  let source = "api";
  let isForm = false;

  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      input = body;
      source = typeof body.source === "string" ? body.source : "api";
    } else {
      // urlencoded or multipart form submit
      const form = await req.formData();
      for (const [k, v] of form.entries()) input[k] = typeof v === "string" ? v : "";
      source = "web-form";
      isForm = true;
    }
  } catch {
    input = {};
  }

  const incomingCid =
    typeof input.confirmationId === "string" ? input.confirmationId : undefined;
  const fields = normalizeIntake(input);
  const submission = addSubmission(fields, source, incomingCid);

  if (isForm) {
    const url = new URL(
      `/submit/confirmation?cid=${encodeURIComponent(submission.confirmationId)}`,
      req.url
    );
    return NextResponse.redirect(url, { status: 303 });
  }

  return NextResponse.json(
    {
      confirmationId: submission.confirmationId,
      status: submission.status,
      fields: submission.fields,
    },
    { status: 201, headers: CORS }
  );
}
