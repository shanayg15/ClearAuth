"use client";

import { useCallback, useEffect, useState } from "react";

type Submission = {
  confirmationId: string;
  status: string;
  fields: Record<string, string>;
  receivedAt: string;
  source: string;
};

type Decision = "under_review" | "approved" | "denied";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const PORTAL_STATUS: Record<Decision, string> = {
  under_review: "Under Review",
  approved: "Approved",
  denied: "Denied",
};

function statusClass(status: string): string {
  return "pp-status pp-status-" + status.toLowerCase().replace(/\s+/g, "_");
}

export default function ControlPage() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const TERMINAL = new Set(["Approved", "Denied"]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/submissions", { cache: "no-store" });
      const data = await res.json();
      const all = Array.isArray(data.submissions) ? data.submissions : [];
      setSubs(all.filter((s: Submission) => !TERMINAL.has(s.status)));
    } catch (err) {
      console.error("[control] load failed", err);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000); // pick up new agent submissions live
    return () => clearInterval(t);
  }, [load]);

  const decide = async (confirmationId: string, decision: Decision) => {
    setBusy(confirmationId + decision);
    setToast(null);
    try {
      // 1. Notify ClearAuth — this flips the doctor dashboard live over SSE.
      const res = await fetch(`${API_URL}/api/payer/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId, status: decision }),
      });
      const data = await res.json().catch(() => ({}));

      // 2. Reflect the decision locally so this console updates immediately.
      await fetch("/api/submissions/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId, status: PORTAL_STATUS[decision] }),
      }).catch(() => {});

      if (res.ok) {
        setToast(`✓ Sent "${decision}" to ClearAuth for ${confirmationId}`);
      } else {
        setToast(`⚠ ClearAuth responded ${res.status}: ${data.error ?? "error"} — portal updated locally`);
      }
      // Remove the card immediately for terminal decisions; under_review keeps it visible.
      if (decision === "approved" || decision === "denied") {
        setSubs((prev) => prev.filter((s) => s.confirmationId !== confirmationId));
      } else {
        await load();
      }
    } catch (err) {
      setToast(`⚠ ${err instanceof Error ? err.message : "Request failed"}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="pp-control-head">
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Operator Console</h1>
          <p className="pp-muted" style={{ margin: "4px 0 0" }}>
            Utilization Management — review and decision incoming prior-authorization requests.
          </p>
        </div>
        <button className="pp-btn pp-btn-ghost pp-btn-sm" onClick={load}>
          ⟳ Refresh
        </button>
      </div>

      {toast && <div className="pp-toast">{toast}</div>}

      {subs.length === 0 ? (
        <div className="pp-card pp-empty">
          No submissions yet. Filled forms and agent submissions appear here automatically.
        </div>
      ) : (
        subs.map((s) => (
          <div className="pp-sub" key={s.confirmationId}>
            <div className="pp-sub-top">
              <div>
                <div className="pp-sub-id">{s.confirmationId}</div>
                <div className="pp-sub-meta">
                  {new Date(s.receivedAt).toLocaleString()} · via {s.source}
                </div>
              </div>
              <span className={statusClass(s.status)}>{s.status}</span>
            </div>

            <div className="pp-sub-grid">
              {Object.entries(s.fields).map(([k, v]) => (
                <div key={k}>
                  <span>{k}:</span>
                  {v}
                </div>
              ))}
            </div>

            <div className="pp-actions">
              <button
                className="pp-btn pp-btn-review pp-btn-sm"
                disabled={busy === s.confirmationId + "under_review"}
                onClick={() => decide(s.confirmationId, "under_review")}
              >
                Mark Under Review
              </button>
              <button
                className="pp-btn pp-btn-approve pp-btn-sm"
                disabled={busy === s.confirmationId + "approved"}
                onClick={() => decide(s.confirmationId, "approved")}
              >
                Approve
              </button>
              <button
                className="pp-btn pp-btn-deny pp-btn-sm"
                disabled={busy === s.confirmationId + "denied"}
                onClick={() => decide(s.confirmationId, "denied")}
              >
                Deny
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
