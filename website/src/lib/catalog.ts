import { CONFIG, type PlanKey, type ProductKind } from './config';

// Storefront view of the clinical catalog (backend/prisma/catalog.ts). `slug`
// matches the backend product slug. Billing only has a few price tiers, so a
// dose just decides which tier applies (mirrors planFor() in
// backend/src/stripe/plan-pricing.ts); the doctor still confirms the final
// prescription.
export interface Dose {
  label: string;
  pack?: string;
  step?: number;
}

export interface StoreProduct {
  slug: string;
  kind: ProductKind;
  brand: string;
  generic: string;
  blurb: string;
  format: string;
  image: keyof typeof CONFIG.IMAGES;
  doses: Dose[];
  // HRT only: lets the patient add micronised progesterone (HRT Complete).
  progesteroneAddOn?: boolean;
  // Matches the ?med= query param used by the homepage product links.
  medKey?: string;
}

const PEN = 'Pre-filled pen, 4 weekly doses';

export const STORE_PRODUCTS: StoreProduct[] = [
  {
    slug: 'semaglutide-wegovy',
    kind: 'GLP1',
    brand: 'Wegovy',
    generic: 'Semaglutide',
    blurb: 'A once-weekly injection that reduces appetite, licensed for weight management.',
    format: 'Weekly pre-filled pen',
    image: 'p-wegovy',
    medKey: 'wegovy',
    doses: [
      { label: '0.25 mg', pack: PEN, step: 1 },
      { label: '0.5 mg', pack: PEN, step: 2 },
      { label: '1 mg', pack: PEN, step: 3 },
      { label: '1.7 mg', pack: PEN, step: 4 },
      { label: '2.4 mg', pack: PEN, step: 5 },
    ],
  },
  {
    slug: 'semaglutide-ozempic',
    kind: 'GLP1',
    brand: 'Ozempic',
    generic: 'Semaglutide',
    blurb: 'A once-weekly semaglutide pen. Your doctor confirms whether it is right for you.',
    format: 'Weekly pre-filled pen',
    image: 'p-ozempic',
    medKey: 'ozempic',
    doses: [
      { label: '0.25 mg', pack: PEN, step: 1 },
      { label: '0.5 mg', pack: PEN, step: 2 },
      { label: '1 mg', pack: PEN, step: 3 },
      { label: '2 mg', pack: PEN, step: 4 },
    ],
  },
  {
    slug: 'tirzepatide-mounjaro',
    kind: 'GLP1',
    brand: 'Mounjaro',
    generic: 'Tirzepatide',
    blurb: 'A once-weekly dual-action injection that supports appetite control and weight loss.',
    format: 'Weekly pre-filled pen',
    image: 'p-mounjaro',
    medKey: 'mounjaro',
    doses: [
      { label: '2.5 mg', pack: PEN, step: 1 },
      { label: '5 mg', pack: PEN, step: 2 },
      { label: '7.5 mg', pack: PEN, step: 3 },
      { label: '10 mg', pack: PEN, step: 4 },
      { label: '12.5 mg', pack: PEN, step: 5 },
      { label: '15 mg', pack: PEN, step: 6 },
    ],
  },
  {
    slug: 'estradiol-gel-oestrogel',
    kind: 'HRT',
    brand: 'Oestrogel',
    generic: 'Estradiol gel 0.06%',
    blurb: 'A daily oestrogen gel you rub into the skin to relieve hot flushes and night sweats.',
    format: 'Daily gel · 80 g pump',
    image: 'p-hrt-starter',
    progesteroneAddOn: true,
    doses: [{ label: '0.75 mg per pump', pack: '80 g pump dispenser (64 pumps)' }],
  },
  {
    slug: 'estradiol-gel-sandrena',
    kind: 'HRT',
    brand: 'Sandrena',
    generic: 'Estradiol gel 0.1%',
    blurb: 'A daily oestrogen gel in single-use sachets, easy to dose and travel with.',
    format: 'Daily gel sachets',
    image: 'p-hrt-complete',
    progesteroneAddOn: true,
    doses: [
      { label: '0.5 mg sachet', pack: '28 sachets' },
      { label: '1 mg sachet', pack: '28 sachets' },
    ],
  },
  {
    slug: 'estradiol-patch-evorel',
    kind: 'HRT',
    brand: 'Evorel',
    generic: 'Estradiol patch',
    blurb: 'A twice-weekly patch that releases oestrogen steadily through the skin.',
    format: 'Twice-weekly patch',
    image: 'p-hrt-starter',
    progesteroneAddOn: true,
    doses: [
      { label: '25 micrograms/24 h', pack: '8 patches' },
      { label: '50 micrograms/24 h', pack: '8 patches' },
      { label: '75 micrograms/24 h', pack: '8 patches' },
      { label: '100 micrograms/24 h', pack: '8 patches' },
    ],
  },
  {
    slug: 'testosterone-gel-tostran',
    kind: 'TRT',
    brand: 'Tostran',
    generic: 'Testosterone gel 2%',
    blurb: 'A daily testosterone gel applied to the skin to restore healthy levels.',
    format: 'Daily gel · 60 g pump',
    image: 'products',
    doses: [
      { label: '20 mg (2 pumps)', pack: '60 g metered-dose pump' },
      { label: '40 mg (4 pumps)', pack: '60 g metered-dose pump' },
    ],
  },
  {
    slug: 'testosterone-injection-sustanon',
    kind: 'TRT',
    brand: 'Sustanon 250',
    generic: 'Testosterone (mixed esters)',
    blurb: 'A periodic injection of testosterone esters for steady, long-acting levels.',
    format: 'Injection',
    image: 'products',
    doses: [{ label: '250 mg/mL', pack: '1 mL ampoule' }],
  },
  {
    slug: 'testosterone-pellets-testopel',
    kind: 'TRT',
    brand: 'Testopel',
    generic: 'Testosterone pellets',
    blurb: 'Small pellets placed under the skin that release testosterone over several months.',
    format: 'Implant',
    image: 'products',
    doses: [{ label: '75 mg pellet', pack: '6 pellets per implant procedure' }],
  },
];

export const PROGESTERONE_NOTE = 'Micronised progesterone (Utrogestan 100 mg capsules) protects the womb if you still have one.';

export function productsFor(kind: ProductKind): StoreProduct[] {
  return STORE_PRODUCTS.filter((p) => p.kind === kind);
}

/** Which price tier a chosen dose falls into. */
export function planKeyFor(product: StoreProduct, dose: Dose, addProgesterone: boolean): PlanKey {
  if (product.kind === 'GLP1') return (dose.step ?? 1) <= 2 ? 'GLP1_STARTER' : 'GLP1_ADVANCED';
  if (product.kind === 'TRT') return 'TRT_STANDARD';
  return addProgesterone ? 'HRT_COMPLETE' : 'HRT_STARTER';
}
