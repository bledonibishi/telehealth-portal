import { ConsultationKind, ProductCategory } from '../common/enums';

// Which subscription plan a prescription belongs to, matching the plans sold
// on the website (WEBSITE_BRIEF.md): GLP-1 Starter covers the titration doses
// up to 0.5 mg, Advanced the maintenance doses (both only a fallback now that
// each GLP-1 dose has its own price); for HRT, "Oestrogen only" or
// "Oestrogen + progesterone". Price ids come from env vars — see planPriceEnvVars.
export type PlanKey = 'GLP1_STARTER' | 'GLP1_ADVANCED' | 'HRT_STARTER' | 'HRT_COMPLETE' | 'TRT_STANDARD';

/**
 * The env vars holding a plan's Stripe price id, in order of preference. The HRT plans are named
 * after what they contain; their older STRIPE_PRICE_HRT_* names are still read.
 */
export function planPriceEnvVars(plan: PlanKey): string[] {
  if (plan === 'HRT_STARTER') return ['STRIPE_PRICE_OESTROGEN', 'STRIPE_PRICE_HRT_STARTER'];
  if (plan === 'HRT_COMPLETE') return ['STRIPE_PRICE_OESTROGEN_PROGESTERONE', 'STRIPE_PRICE_HRT_COMPLETE'];
  return [`STRIPE_PRICE_${plan}`];
}

export function planFor(
  kind: ConsultationKind | string,
  items: Array<{ category: ProductCategory | string; titrationStep: number | null }>,
): PlanKey {
  if (kind === ConsultationKind.GLP1) {
    const step = items.find((i) => i.category === ProductCategory.GLP1)?.titrationStep ?? 1;
    return step <= 2 ? 'GLP1_STARTER' : 'GLP1_ADVANCED';
  }
  if (kind === ConsultationKind.TRT) return 'TRT_STANDARD';
  return items.some((i) => i.category === ProductCategory.PROGESTOGEN) ? 'HRT_COMPLETE' : 'HRT_STARTER';
}
