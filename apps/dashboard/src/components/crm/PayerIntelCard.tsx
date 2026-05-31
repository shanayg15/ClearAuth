"use client";

import { useEffect, useState } from "react";
import { getPayerIntel } from "@/lib/api";
import type { PayerIntel } from "@/lib/payer-intel";

interface PayerIntelCardProps {
  insurer?: string;
  treatment?: string;
}

// "Payer Intelligence" card — pulls the insurer's published PA stats via Apify
// (scraped server-side) and shows them alongside the request. Fails soft to a
// deterministic profile so the card is always populated.
export function PayerIntelCard({ insurer, treatment }: PayerIntelCardProps) {
  const [intel, setIntel] = useState<PayerIntel | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!insurer) return;
    let alive = true;
    setLoading(true);
    getPayerIntel(insurer, treatment ?? "")
      .then((r) => {
        if (alive) setIntel(r);
      })
      .catch(() => {
        if (alive) setIntel(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [insurer, treatment]);

  if (!insurer) return null;

  const live = intel?.source === "apify";

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-900">
          Payer Intelligence · {insurer}
        </h3>
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-indigo-500" : "bg-gray-300"}`} />
          {live ? "Live via Apify" : "Apify (fallback)"}
        </span>
      </div>

      {loading && !intel ? (
        <p className="mt-2 text-sm text-gray-400">Looking up {insurer}…</p>
      ) : intel ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-white/70 p-3">
            <p className="text-[11px] font-semibold uppercase text-gray-400">Approval rate</p>
            <p className="mt-0.5 text-sm font-bold text-gray-900">{intel.approvalRate ?? "—"}</p>
          </div>
          <div className="rounded-lg bg-white/70 p-3">
            <p className="text-[11px] font-semibold uppercase text-gray-400">Avg turnaround</p>
            <p className="mt-0.5 text-sm font-bold text-gray-900">{intel.avgTurnaround ?? "—"}</p>
          </div>
          {intel.headline && (
            <div className="col-span-2 rounded-lg bg-white/70 p-3">
              <p className="text-[11px] font-semibold uppercase text-gray-400">Recent</p>
              {intel.sourceUrl ? (
                <a
                  href={intel.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block text-sm text-indigo-700 hover:underline"
                >
                  {intel.headline}
                </a>
              ) : (
                <p className="mt-0.5 text-sm text-gray-800">{intel.headline}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-400">No payer data available.</p>
      )}
    </div>
  );
}
