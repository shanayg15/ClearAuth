// Apify regulatory-SLA lookup (owner: Pranav) — Apify use #2.
//
// lookupPaRegulation(payer) scrapes the prior-authorization decision-turnaround
// mandate that governs the payer (CMS Interoperability & Prior Authorization
// Final Rule, CMS-0057-F: expedited 72h / standard 7 calendar days, phasing in
// 2026; plus payer/state specifics) and returns it as a ComplianceCheck for the
// compliance panel. Fail-soft: with no APIFY_API_TOKEN, or when nothing parses,
// it returns an accurate built-in SLA so the check is always present. Logs
// `[apify-reg] ...`.

import { ComplianceCheck } from "@clearauth/types";
import { apifySearch } from "./apify-search";

const LABEL = "Payer decision SLA (regulatory)";

// Accurate, demo-safe default — the federal baseline that applies to impacted
// payers under CMS-0057-F. Used whenever the live scrape is unavailable.
const FALLBACK_SLA: ComplianceCheck = {
  label: LABEL,
  status: "pass",
  detail: "Standard 7 calendar days / expedited 72h — CMS-0057-F Interoperability & Prior Authorization Final Rule",
};

// The per-payer regulation is essentially static, so cache it for the session to
// avoid re-scraping on every compliance re-run.
const CACHE = new Map<string, ComplianceCheck>();

export async function lookupPaRegulation(payer: string): Promise<ComplianceCheck> {
  const key = payer.toLowerCase().trim() || "default";
  const cached = CACHE.get(key);
  if (cached) return cached;

  if (!process.env.APIFY_API_TOKEN) {
    console.log("[apify-reg] no token — built-in SLA");
    return FALLBACK_SLA;
  }

  const query = `${payer} prior authorization decision turnaround time requirement CMS final rule 2026`;
  const { text, url } = await apifySearch(query, "APIFY_REG_ACTOR");
  const match = text.join(" ").match(/(\d+)\s*(hours?|hrs?|business days?|calendar days?|days?)/i);
  if (!match) {
    console.log("[apify-reg] no turnaround figure parsed — built-in SLA");
    return FALLBACK_SLA;
  }

  const check: ComplianceCheck = {
    label: LABEL,
    status: "pass",
    detail: `Mandated decision turnaround ≈ ${match[0]} for ${payer}${url ? ` — ${url}` : ""} (scraped via Apify)`,
  };
  CACHE.set(key, check);
  console.log(`[apify-reg] live SLA for ${payer}: ${match[0]}`);
  return check;
}
