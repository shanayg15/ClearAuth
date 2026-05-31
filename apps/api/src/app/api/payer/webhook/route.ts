import { NextRequest, NextResponse } from "next/server";
import { AuthRequest, AuthStatus } from "@clearauth/types";
import { corsHeaders, corsResponse } from "@/lib/cors";
import { getAuthRequest, listAuthRequests, upsertAuthRequest } from "@/lib/store";
import { createAuditEntry } from "@/lib/audit";

// Owner: Sahiel. Payer status callback. The mock payer portal's /control page
// POSTs { confirmationId | id, status } here when the operator approves/denies a
// request; we find the matching AuthRequest, flip its status, append an audit
// entry, and upsert (which pushes the live SSE update the dashboard animates).
// CORS lets the portal (:3009) call this from the browser.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECISION_STATUSES: AuthStatus[] = ["under_review", "approved", "denied"];

function normalizeStatus(raw: unknown): AuthStatus | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const map: Record<string, AuthStatus> = {
    approve: "approved",
    approved: "approved",
    deny: "denied",
    denied: "denied",
    decline: "denied",
    declined: "denied",
    reject: "denied",
    rejected: "denied",
    under_review: "under_review",
    review: "under_review",
    reviewing: "under_review",
    received: "under_review",
    pending: "under_review",
  };
  const mapped = map[v];
  return mapped && DECISION_STATUSES.includes(mapped) ? mapped : null;
}

async function findRequest(id: string, confirmationId: string): Promise<AuthRequest | undefined> {
  if (id) {
    const r = await getAuthRequest(id);
    if (r) return r;
  }
  if (confirmationId) {
    const all = await listAuthRequests();
    const exact = all.find((r) => r.submission?.confirmationId === confirmationId);
    if (exact) return exact;
    // Last-resort correlation for the single-patient demo: if the portal's
    // confirmation id never propagated to the request (e.g. Rtrvr filled the form
    // and the portal minted its own id), apply the decision to the newest request
    // that is actually awaiting one.
    const pending = all.find((r) => r.status === "submitted" || r.status === "under_review");
    if (pending) {
      console.warn(
        `[payer-webhook] no exact match for ${confirmationId}; applying to newest awaiting request ${pending.id}`
      );
      return pending;
    }
  }
  return undefined;
}

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const body = await req.json().catch(() => ({}));
    const id: string = typeof body.id === "string" ? body.id : "";
    const confirmationId: string = typeof body.confirmationId === "string" ? body.confirmationId : "";
    const status = normalizeStatus(body.status);

    if (!status) {
      return NextResponse.json(
        { error: "status must be one of: under_review | approved | denied" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }
    if (!id && !confirmationId) {
      return NextResponse.json(
        { error: "id or confirmationId is required" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const existing = await findRequest(id, confirmationId);
    if (!existing) {
      return NextResponse.json(
        { error: "No matching authorization request" },
        { status: 404, headers: corsHeaders(origin) }
      );
    }

    existing.status = status;
    existing.auditTrail.push(
      createAuditEntry(
        "payer-webhook",
        "payer_decision",
        `Payer (${existing.patient?.insurer ?? "insurer"}) set status to ${status}${
          confirmationId ? ` for confirmation ${confirmationId}` : ""
        }`
      )
    );
    await upsertAuthRequest(existing);
    console.log(`[payer-webhook] ${existing.id} → ${status}`);

    return NextResponse.json({ ok: true, request: existing }, { headers: corsHeaders(origin) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders(origin) });
  }
}
