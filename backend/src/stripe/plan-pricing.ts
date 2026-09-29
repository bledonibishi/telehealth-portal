import { ConsultationKind, ProductCategory } from '../common/enums';

// Which subscription plan a prescription belongs to, matching the plans sold
// on the website (WEBSITE_BRIEF.md): GLP-1 Starter covers the titration doses
// up to 0.5 mg, Advanced the maintenance doses; HRT Complete adds a
// progestogen. Price ids come from STRIPE_PRICE_<PLAN> env vars.
export type PlanKey = 'GLP1_STARTER' | 'GLP1_ADVANCED' | 'HRT_STARTER' | 'HRT_COMPLETE';

export function planFor(
  kind: ConsultationKind | string,
  items: Array<{ category: ProductCategory | string; titrationStep: number | null }>,
): PlanKey {
  if (kind === ConsultationKind.GLP1) {
    const step = items.find((i) => i.category === ProductCategory.GLP1)?.titrationStep ?? 1;
    return step <= 2 ? 'GLP1_STARTER' : 'GLP1_ADVANCED';
  }
  return items.some((i) => i.category === ProductCategory.PROGESTOGEN) ? 'HRT_COMPLETE' : 'HRT_STARTER';
}
