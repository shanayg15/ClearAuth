// Apify ICD-10 / CPT validation (owner: Pranav) — Apify use #3.
//
// validateCoding(req) confirms the codes the extraction agent produced are real
// and consistent with the diagnosis: it scrapes the authoritative description for
// the ICD-10 code, surfaces it, and flags a possible mismatch — catching
// LLM-hallucinated or wrong codes — as a ComplianceCheck. Fail-soft: with no
// token it does a format-only check (still useful); on any error it returns that
// base check. Logs `[apify-coding] ...`.

import { AuthRequest, ComplianceCheck } from "@clearauth/types";
import { apifySearch } from "./apify-search";

const LABEL = "Diagnosis & procedure coding verified";
// ICD-10-CM: a letter, a digit, an alphanumeric, then an optional dot + up to 4.
const ICD10_RE = /^[A-Z]\d[A-Z0-9](?:\.[A-Z0-9]{1,4})?$/i;
const CPT_RE = /^\d{5}$/;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "without", "chronic", "acute", "unspecified", "other", "disease", "disorder",
]);

function keywords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOPWORDS.has(w));
}

// icd10 (uppercased) -> scraped human-readable description.
const CACHE = new Map<string, string>();

function formatCheck(icd10?: string, cpt?: string): ComplianceCheck {
  if (!icd10) {
    return { label: LABEL, status: "warn", detail: "No ICD-10 code extracted" };
  }
  const wellFormed = ICD10_RE.test(icd10) && (!cpt || CPT_RE.test(cpt));
  return {
    label: LABEL,
    status: wellFormed ? "pass" : "warn",
    detail: `ICD-10 ${icd10}${cpt ? ` · CPT ${cpt}` : ""} — ${wellFormed ? "valid code format" : "check code format"}`,
  };
}

export async function validateCoding(req: AuthRequest): Promise<ComplianceCheck> {
  const icd10 = req.extraction?.icd10?.trim();
  const cpt = req.extraction?.cptCode?.trim();
  const base = formatCheck(icd10, cpt);

  if (!process.env.APIFY_API_TOKEN || !icd10) {
    if (icd10) console.log(`[apify-coding] no token — format-only check for ${icd10}`);
    return base;
  }

  try {
    let desc = CACHE.get(icd10.toUpperCase());
    if (!desc) {
      const { text } = await apifySearch(`ICD-10-CM ${icd10} diagnosis code description`, "APIFY_CODING_ACTOR");
      const hit = text.find((t) => t.toUpperCase().includes(icd10.toUpperCase())) ?? text[0];
      desc = hit ? hit.replace(/\s+/g, " ").slice(0, 90).trim() : undefined;
      if (desc) CACHE.set(icd10.toUpperCase(), desc);
    }
    if (!desc) {
      console.log(`[apify-coding] no description scraped for ${icd10} — format-only`);
      return base;
    }

    // Does the scraped description share vocabulary with the extracted diagnosis?
    const diagnosisWords = new Set(keywords(req.extraction?.diagnosis ?? ""));
    const matches = diagnosisWords.size === 0 || keywords(desc).some((w) => diagnosisWords.has(w));
    console.log(`[apify-coding] ${icd10} -> "${desc}" (match=${matches})`);
    return {
      label: LABEL,
      status: matches ? "pass" : "warn",
      detail: `ICD-10 ${icd10} = ${desc}${cpt ? ` · CPT ${cpt}` : ""}${matches ? "" : " — may not match the stated diagnosis"} (verified via Apify)`,
    };
  } catch (err) {
    console.error("[apify-coding] error:", err instanceof Error ? err.message : err);
    return base;
  }
}
