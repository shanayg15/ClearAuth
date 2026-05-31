// Payer Intelligence via Apify (owner: Pranav) — Apify use #4.
//
// lookupPayerIntel(payer, treatment) scrapes the insurer's published
// prior-authorization stats — approval rate, average decision turnaround, and a
// recent PA-policy headline — to power a small "Payer Intelligence" card in the
// CRM. Runs SERVER-SIDE ONLY (called from the /api/payer-intel route handler) so
// the APIFY_API_TOKEN never reaches the browser. Uses Apify's REST
// run-sync-get-dataset-items endpoint, so the dashboard needs no extra SDK.
// Fail-soft: with no token, or on any error/timeout, returns a deterministic
// fallback. Logs `[apify-intel] ...`.

export interface PayerIntel {
  payer: string;
  approvalRate?: string;
  avgTurnaround?: string;
  headline?: string;
  sourceUrl?: string;
  source: "apify" | "fallback";
}

const TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE = new Map<string, { value: PayerIntel; expiresAt: number }>();

function fallbackIntel(payer: string): PayerIntel {
  return {
    payer: payer || "Payer",
    approvalRate: "~80% approved after review",
    avgTurnaround: "~5 day standard decision",
    headline: "CMS prior-authorization rule tightens decision turnaround for 2026",
    source: "fallback",
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function collect(items: unknown[]): { text: string[]; url?: string; title?: string } {
  const text: string[] = [];
  let url: string | undefined;
  let title: string | undefined;
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) text.push(v.trim());
  };
  for (const item of items) {
    const rec = asRecord(item);
    if (!rec) continue;
    push(rec.description);
    push(rec.snippet);
    push(rec.title);
    if (!url && typeof rec.url === "string") url = rec.url;
    const organic = rec.organicResults ?? rec.organic_results ?? rec.results;
    if (Array.isArray(organic)) {
      for (const o of organic) {
        const orec = asRecord(o);
        if (!orec) continue;
        push(orec.description);
        push(orec.snippet);
        push(orec.title);
        if (!url && typeof orec.url === "string") url = orec.url;
        if (!title && typeof orec.title === "string") title = orec.title;
      }
    }
  }
  return { text, url, title };
}

function parseIntel(items: unknown[], payer: string): PayerIntel | null {
  const { text, url, title } = collect(items);
  if (text.length === 0) return null;
  const joined = text.join(" ");
  const rate = joined.match(/(\d{1,3})\s?%/);
  const turn = joined.match(/(\d+)\s*(business days?|calendar days?|days?|hours?|hrs?)/i);
  if (!rate && !turn) return null;
  return {
    payer: payer || "Payer",
    approvalRate: rate ? `${rate[1]}% approval` : undefined,
    avgTurnaround: turn ? `~${turn[0]} decision` : undefined,
    headline: title,
    sourceUrl: url,
    source: "apify",
  };
}

export async function lookupPayerIntel(payer: string, treatment: string): Promise<PayerIntel> {
  const key = `${payer}|${treatment}`.toLowerCase();
  const hit = CACHE.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const token = process.env.APIFY_API_TOKEN;
  if (!token || !payer) {
    console.log("[apify-intel] no token/payer — fallback");
    return fallbackIntel(payer);
  }

  const actor = (process.env.APIFY_INTEL_ACTOR ?? "apify/google-search-scraper").replace("/", "~");
  const endpoint = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const query = `${payer} prior authorization approval rate average decision turnaround time ${treatment}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    console.log(`[apify-intel] live -> ${actor} q="${query.slice(0, 60)}"`);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries: query, maxPagesPerQuery: 1, resultsPerPage: 5 }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`[apify-intel] HTTP ${res.status} — fallback`);
      return fallbackIntel(payer);
    }
    const body = (await res.json().catch(() => [])) as unknown;
    const intel = parseIntel(Array.isArray(body) ? body : [], payer);
    if (!intel) {
      console.log("[apify-intel] nothing parsed — fallback");
      return fallbackIntel(payer);
    }
    CACHE.set(key, { value: intel, expiresAt: Date.now() + CACHE_TTL_MS });
    console.log(`[apify-intel] ok — rate=${intel.approvalRate ?? "?"} turn=${intel.avgTurnaround ?? "?"}`);
    return intel;
  } catch (err) {
    console.error("[apify-intel] error:", err instanceof Error ? err.message : err);
    return fallbackIntel(payer);
  } finally {
    clearTimeout(timer);
  }
}
