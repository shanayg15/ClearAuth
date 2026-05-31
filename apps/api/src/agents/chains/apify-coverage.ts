import { CriteriaItem } from "@clearauth/types";

// Apify coverage-criteria scraper (owner: Sahiel).
//
// lookupCoverageCriteria() runs an Apify web-search actor to fetch the payer's
// published medical-policy criteria for a treatment, then extracts candidate
// requirement bullets. It fails soft: with no APIFY_API_TOKEN, or on any
// error/timeout/empty result, it returns { criteria: [] } so the criteria chain
// falls back to its built-in table. Logs `[apify-coverage] ...`.

const APIFY_TIMEOUT_MS = 15_000;

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

// Lines that read like a coverage requirement rather than marketing copy.
const REQUIREMENT_RE =
  /(must|required|require[sd]?|documented|prior to|at least|minimum|failed|trial of|criteria|weeks|months|conservative|medically necessary|contraindicat|confirmed|evidence of)/i;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

// Pull readable text out of whatever shape the search actor returns.
function collectText(items: unknown[]): string[] {
  const chunks: string[] = [];
  const pushStr = (v: unknown) => {
    if (typeof v === "string" && v.trim()) chunks.push(v.trim());
  };
  for (const item of items) {
    const rec = asRecord(item);
    if (!rec) continue;
    pushStr(rec.description);
    pushStr(rec.snippet);
    pushStr(rec.text);
    pushStr(rec.title);
    const organic = rec.organicResults ?? rec.organic_results ?? rec.results;
    if (Array.isArray(organic)) {
      for (const o of organic) {
        const orec = asRecord(o);
        if (!orec) continue;
        pushStr(orec.description);
        pushStr(orec.snippet);
        pushStr(orec.title);
      }
    }
  }
  return chunks;
}

function firstUrl(items: unknown[]): string | undefined {
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

function extractCriteria(
  items: unknown[],
  treatment: string
): { criteria: CriteriaItem[]; source?: string } {
  const text = collectText(items).join(" ");
  if (!text) return { criteria: [] };

  const sentences = text
    .split(/(?<=[.!?;•\n])\s+|•|;/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 16 && s.length <= 160 && REQUIREMENT_RE.test(s));

  const seen = new Set<string>();
  const labels: string[] = [];
  for (const s of sentences) {
    const key = s.toLowerCase().slice(0, 48);
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(s.replace(/\s*[.;]+$/, ""));
    if (labels.length >= 5) break;
  }
  if (labels.length === 0) return { criteria: [] };

  const url = firstUrl(items);
  const criteria: CriteriaItem[] = labels.map((label) => ({ label, met: false }));
  return { criteria, source: url ? `${url} (Apify)` : `${treatment} policy (Apify)` };
}

export async function lookupCoverageCriteria(
  payer: string,
  treatment: string
): Promise<{ criteria: CriteriaItem[]; source?: string }> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    console.log("[apify-coverage] no APIFY_API_TOKEN — using built-in criteria");
    return { criteria: [] };
  }

  try {
    const { ApifyClient } = await import("apify-client");
    const client = new ApifyClient({ token });
    const actorId = process.env.APIFY_COVERAGE_ACTOR ?? "apify/google-search-scraper";
    const query = `${payer} ${treatment} prior authorization criteria medical policy`;
    console.log(`[apify-coverage] running actor ${actorId} q="${query}"`);

    const run = await withTimeout(
      client.actor(actorId).call({
        queries: query,
        maxPagesPerQuery: 1,
        resultsPerPage: 5,
      }),
      APIFY_TIMEOUT_MS
    );
    if (!run) {
      console.error("[apify-coverage] actor run timed out");
      return { criteria: [] };
    }

    const listed = await withTimeout(
      client.dataset(run.defaultDatasetId).listItems(),
      APIFY_TIMEOUT_MS
    );
    const items = listed?.items ?? [];

    const { criteria, source } = extractCriteria(items, treatment);
    if (criteria.length === 0) {
      console.log("[apify-coverage] no criteria parsed — falling back to built-in");
      return { criteria: [] };
    }
    console.log(`[apify-coverage] parsed ${criteria.length} criteria from ${source}`);
    return { criteria, source };
  } catch (err) {
    console.error("[apify-coverage] error:", err instanceof Error ? err.message : err);
    return { criteria: [] };
  }
}
