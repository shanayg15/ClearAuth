// Shared Apify google-search-scraper helper (owner: Pranav).
//
// Both compliance-side Apify uses — apify-regulatory (PA turnaround SLA) and
// apify-coding (ICD-10/CPT validation) — funnel through here so they don't each
// re-implement the apify-client plumbing. Mirrors the actor + call shape that
// chains/apify-coverage.ts (Sahiel) already uses, kept as a SEPARATE file so we
// never edit his code. Fail-soft is the #1 rule: with no APIFY_API_TOKEN, or on
// any error/timeout, it returns empty text so callers fall back. Logs
// `[apify-search] ...`.

const APIFY_TIMEOUT_MS = 12_000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

// Pull readable snippets out of whatever shape the search actor returns.
export function collectText(items: unknown[]): string[] {
  const chunks: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) chunks.push(v.trim());
  };
  for (const item of items) {
    const rec = asRecord(item);
    if (!rec) continue;
    push(rec.description);
    push(rec.snippet);
    push(rec.text);
    push(rec.title);
    const organic = rec.organicResults ?? rec.organic_results ?? rec.results;
    if (Array.isArray(organic)) {
      for (const o of organic) {
        const orec = asRecord(o);
        if (!orec) continue;
        push(orec.description);
        push(orec.snippet);
        push(orec.title);
      }
    }
  }
  return chunks;
}

export function firstUrl(items: unknown[]): string | undefined {
  for (const item of items) {
    const rec = asRecord(item);
    if (!rec) continue;
    if (typeof rec.url === "string") return rec.url;
    const organic = rec.organicResults ?? rec.organic_results ?? rec.results;
    if (Array.isArray(organic)) {
      for (const o of organic) {
        const orec = asRecord(o);
        if (orec && typeof orec.url === "string") return orec.url;
      }
    }
  }
  return undefined;
}

export type ApifySearchResult = { text: string[]; url?: string };

// Run the google-search-scraper actor for `query`. `actorEnv` lets a caller pin a
// per-use actor override (e.g. "APIFY_REG_ACTOR"); otherwise APIFY_SEARCH_ACTOR or
// the shared default. Returns { text: [] } on no-token / error / timeout.
export async function apifySearch(query: string, actorEnv?: string): Promise<ApifySearchResult> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    console.log(`[apify-search] no APIFY_API_TOKEN — skip "${query.slice(0, 60)}"`);
    return { text: [] };
  }
  try {
    const { ApifyClient } = await import("apify-client");
    const client = new ApifyClient({ token });
    const actorId =
      (actorEnv ? process.env[actorEnv] : undefined) ??
      process.env.APIFY_SEARCH_ACTOR ??
      "apify/google-search-scraper";
    console.log(`[apify-search] actor=${actorId} q="${query.slice(0, 60)}"`);

    const run = await withTimeout(
      client.actor(actorId).call({ queries: query, maxPagesPerQuery: 1, resultsPerPage: 5 }),
      APIFY_TIMEOUT_MS
    );
    if (!run) {
      console.error("[apify-search] actor run timed out");
      return { text: [] };
    }

    const listed = await withTimeout(client.dataset(run.defaultDatasetId).listItems(), APIFY_TIMEOUT_MS);
    const items = listed?.items ?? [];
    const text = collectText(items);
    console.log(`[apify-search] ${text.length} text chunks for "${query.slice(0, 40)}"`);
    return { text, url: firstUrl(items) };
  } catch (err) {
    console.error("[apify-search] error:", err instanceof Error ? err.message : err);
    return { text: [] };
  }
}
