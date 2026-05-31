import { CriteriaItem } from "@clearauth/types";

// STUB (owner: Sahiel). Scrapes the payer's published medical-policy criteria
// via Apify. Returns believable coverage criteria with no network so the
// criteria chain works offline. Real impl: run an Apify actor for `payer` and
// map the scraped policy to CriteriaItem[].

export async function lookupCoverageCriteria(
  payer: string,
  treatment: string
): Promise<{ criteria: CriteriaItem[]; source?: string }> {
  console.log(`[apify-coverage] stub lookup payer="${payer}" treatment="${treatment}"`);
  try {
    const criteria: CriteriaItem[] = [
      {
        label: "Conservative therapy attempted (≥6 weeks)",
        met: true,
        evidence: "Physical therapy and NSAID trial documented in clinical note",
      },
      {
        label: "Symptom duration documented",
        met: true,
        evidence: "Symptoms persisting beyond 6 weeks per note",
      },
      {
        label: `${treatment} is medically necessary`,
        met: true,
        evidence: "Indicated after failure of conservative management",
      },
      { label: "No documented contraindications", met: true, evidence: "None noted" },
    ];
    return { criteria, source: `${payer} medical policy (mock)` };
  } catch (err) {
    console.error("[apify-coverage] stub error:", err);
    return { criteria: [] };
  }
}
