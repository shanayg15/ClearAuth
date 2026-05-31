import { NextRequest, NextResponse } from "next/server";
import { lookupPayerIntel } from "@/lib/payer-intel";

// GET /api/payer-intel?payer=Aetna&treatment=MRI%20lumbar%20spine
//
// Runs server-side so the APIFY_API_TOKEN stays off the client. SDK-free — the
// scrape uses Apify's REST run-sync endpoint inside lookupPayerIntel. Always 200s
// with a fail-soft body so the card never errors.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const payer = params.get("payer") ?? "";
  const treatment = params.get("treatment") ?? "";
  try {
    const intel = await lookupPayerIntel(payer, treatment);
    return NextResponse.json(intel);
  } catch {
    return NextResponse.json({ payer: payer || "Payer", source: "fallback" });
  }
}
