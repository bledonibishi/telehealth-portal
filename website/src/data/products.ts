import type { ProductKey } from './questions';

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  price: number;
  interval: 'month' | 'one-time';
  features: string[];
  /** Replace with your real Stripe Price ID */
  stripePriceId: string;
  popular?: boolean;
}

export const PLANS: Record<ProductKey, Plan[]> = {
  hrt: [
    {
      id: 'hrt-starter',
      name: 'HRT Starter',
      tagline: 'Estradiol gel — the most prescribed starting point for menopause relief',
      price: 49,
      interval: 'month',
      features: [
        'Estradiol gel (0.1%)',
        '3-month supply on first order',
        'Monthly prescription review',
        'Secure messaging with your clinician',
        'Free UK delivery',
      ],
      stripePriceId: process.env.STRIPE_PRICE_HRT_STARTER ?? 'price_hrt_starter_placeholder',
    },
    {
      id: 'hrt-complete',
      name: 'HRT Complete',
      tagline: 'Combined oestrogen + progesterone — recommended if you have a uterus',
      price: 79,
      interval: 'month',
      popular: true,
      features: [
        'Estradiol gel + micronised progesterone',
        '3-month supply on first order',
        'Monthly prescription review',
        'Priority clinician access',
        'Secure messaging',
        'Free UK delivery',
      ],
      stripePriceId: process.env.STRIPE_PRICE_HRT_COMPLETE ?? 'price_hrt_complete_placeholder',
    },
  ],
  glp1: [
    {
      id: 'glp1-starter',
      name: 'GLP-1 Starter',
      tagline: 'Semaglutide at a starting dose — safe, gradual titration over 12 weeks',
      price: 149,
      interval: 'month',
      features: [
        'Semaglutide 0.25 mg → 0.5 mg titration',
        'Weekly self-injection pen',
        'Monthly clinical review',
        'Dietitian-led nutrition guidance',
        'Free UK delivery',
      ],
      stripePriceId: process.env.STRIPE_PRICE_GLP1_STARTER ?? 'price_glp1_starter_placeholder',
    },
    {
      id: 'glp1-advanced',
      name: 'GLP-1 Advanced',
      tagline: 'Semaglutide 1 mg — full maintenance dose for continued results',
      price: 199,
      interval: 'month',
      popular: true,
      features: [
        'Semaglutide 1 mg weekly',
        'Monthly clinical review',
        'Personalised meal plan',
        'Priority clinician & dietitian access',
        'Progress tracking dashboard',
        'Free UK delivery',
      ],
      stripePriceId: process.env.STRIPE_PRICE_GLP1_ADVANCED ?? 'price_glp1_advanced_placeholder',
    },
  ],
};
