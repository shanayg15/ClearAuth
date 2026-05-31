"use client";

import { useEffect, useState } from "react";
import { getPayerIntel } from "@/lib/api";
import type { PayerIntel } from "@/lib/payer-intel";
import { TrendingUp, Timer, ExternalLink, BarChart2 } from "lucide-react";

interface PayerIntelCardProps {
  insurer?: string;
  treatment?: string;
}

export function PayerIntelCard({ insurer, treatment }: PayerIntelCardProps) {
  const [intel, setIntel] = useState<PayerIntel | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!insurer) return;
    let alive = true;
    setLoading(true);
    getPayerIntel(insurer, treatment ?? "")
      .then((r) => { if (alive) setIntel(r); })
      .catch(() => { if (alive) setIntel(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [insurer, treatment]);

  if (!insurer) return null;

  const live = intel?.source === "apify";

  return (
    <div className="pi">
      <div className="pi-hdr">
        <span className="pi-title" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <BarChart2 size={11} strokeWidth={2} />
          {insurer}
        </span>
        <span className="pi-source" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, background: live ? "var(--blue)" : "var(--mid)", display: "inline-block" }} />
          {live ? "Live" : "Fallback"}
        </span>
      </div>

      {loading && !intel ? (
        <span className="pi-empty">Loading…</span>
      ) : intel ? (
        <>
          <div className="pi-stats">
            <div>
              <div className="pi-stat-num">{intel.approvalRate ?? "—"}</div>
              <div className="pi-stat-lbl" style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <TrendingUp size={9} strokeWidth={2} /> Approval rate
              </div>
            </div>
            <div>
              <div className="pi-stat-num">{intel.avgTurnaround ?? "—"}</div>
              <div className="pi-stat-lbl" style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Timer size={9} strokeWidth={2} /> Avg turnaround
              </div>
            </div>
          </div>
          {intel.headline && (
            <div className="pi-headline">
              <div className="pi-headline-lbl">Recent</div>
              <div className="pi-headline-text">
                {intel.sourceUrl ? (
                  <a href={intel.sourceUrl} target="_blank" rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {intel.headline}
                    <ExternalLink size={10} strokeWidth={2} />
                  </a>
                ) : intel.headline}
              </div>
            </div>
          )}
        </>
      ) : (
        <span className="pi-empty">No payer data.</span>
      )}
    </div>
  );
}
