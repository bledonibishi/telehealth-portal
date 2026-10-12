/**
 * Matches the products in Stripe to the doses in the catalog by name, so each dose's price id
 * doesn't have to be copied by hand (see scripts/sync-dose-prices.ts).
 *
 * "Mounjaro 7.5mg" → Mounjaro 7.5 mg. A Stripe product that names a brand but no dose
 * ("Oestrogel (80 g pump)", "Evorel patches (any strength)") prices every dose of that brand.
 */

export interface CatalogStrength {
  id: string;
  label: string;
  productName: string; // brand name, else generic name
  productAliases: string[]; // brand, generic name and slug
  stripePriceId: string | null;
}

export interface StripePriceInfo {
  id: string;
  productName: string;
  recurring: boolean;
  amountCents: number | null;
  currency: string;
}

export interface Match {
  strength: CatalogStrength;
  price: StripePriceInfo;
}

const DOSE = /(\d+(?:\.\d+)?)\s*(mg|micrograms?|mcg)\b/i;

/** The strength's number, e.g. 7.5 for "7.5 mg" or 25 for "25 micrograms/24 h". */
const doseNumber = (text: string): number | null => {
  const m = text.match(DOSE);
  return m ? parseFloat(m[1]) : null;
};

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The catalog strengths a Stripe product name refers to. */
export function strengthsFor(stripeName: string, strengths: CatalogStrength[]): CatalogStrength[] {
  const name = ` ${words(stripeName)} `;
  const brand = strengths.filter((s) => s.productAliases.some((a) => a && name.includes(` ${words(a)} `)));
  if (!brand.length) return [];
  const dose = doseNumber(stripeName);
  if (dose === null) return brand; // one price for every dose of the product
  return brand.filter((s) => doseNumber(s.label) === dose);
}

/**
 * Each catalog strength paired with the recurring Stripe price whose product names it. A product
 * with several recurring prices uses the first; one-off prices are reported separately.
 */
export function matchPrices(strengths: CatalogStrength[], prices: StripePriceInfo[]) {
  const matches: Match[] = [];
  const oneOff: Match[] = [];
  const unmatchedProducts = new Set<string>();
  const taken = new Set<string>();

  for (const price of prices) {
    const found = strengthsFor(price.productName, strengths);
    if (!found.length) {
      unmatchedProducts.add(price.productName);
      continue;
    }
    for (const strength of found) {
      if (!price.recurring) oneOff.push({ strength, price });
      else if (!taken.has(strength.id)) {
        taken.add(strength.id);
        matches.push({ strength, price });
      }
    }
  }

  const unpriced = strengths.filter((s) => !taken.has(s.id));
  return { matches, oneOff, unpriced, unmatchedProducts: [...unmatchedProducts] };
}
