import { PrismaClient, ConsultationKind, ProductCategory, ProductForm } from '@prisma/client';

// Prescribable medicines. Safe to re-run: products are matched by slug and
// strengths by label, so this updates in place and never deletes (withdraw a
// product with the setProductActive mutation instead).
//
// Starting data only — the partner pharmacy and medical lead must confirm
// every product, strength, pack and default direction before go-live.
//
//   pnpm --filter @telehealth/backend prisma:seed-catalog

type StrengthSeed = { label: string; pack?: string; step?: number; qty?: number };
type ProductSeed = {
  slug: string;
  name: string;
  brandName?: string;
  kind: ConsultationKind;
  category: ProductCategory;
  form: ProductForm;
  coldChain?: boolean;
  weeksPerStep?: number;
  // Days between doses, for the patient's dose calendar — only set where the
  // regimen is a clean fixed interval (e.g. weekly, daily).
  doseIntervalDays?: number;
  // Doses a week on the same weekdays each week (e.g. 2 for twice-weekly
  // patches), for regimens with no clean fixed interval.
  dosesPerWeek?: number;
  directions: string;
  strengths: StrengthSeed[];
  // Defaults to true. Set false for a product that isn't ready to prescribe
  // yet (e.g. missing fulfilment logistics) — toggle it back on later with
  // the setProductActive mutation rather than editing this file.
  active?: boolean;
};

const WEEKLY_INJECTION =
  'Inject under the skin once a week, on the same day each week (abdomen, thigh or upper arm). Rotate injection sites.';

export const CATALOG: ProductSeed[] = [
  {
    slug: 'semaglutide-wegovy',
    name: 'Semaglutide',
    brandName: 'Wegovy',
    kind: ConsultationKind.GLP1,
    category: ProductCategory.GLP1,
    form: ProductForm.INJECTION_PEN,
    coldChain: true,
    weeksPerStep: 4,
    doseIntervalDays: 7,
    directions: WEEKLY_INJECTION,
    strengths: [
      { label: '0.25 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 1 },
      { label: '0.5 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 2 },
      { label: '1 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 3 },
      { label: '1.7 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 4 },
      { label: '2.4 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 5 },
    ],
  },
  {
    // Licensed for type 2 diabetes; weight management is off-label.
    slug: 'semaglutide-ozempic',
    name: 'Semaglutide',
    brandName: 'Ozempic',
    kind: ConsultationKind.GLP1,
    category: ProductCategory.GLP1,
    form: ProductForm.INJECTION_PEN,
    coldChain: true,
    weeksPerStep: 4,
    doseIntervalDays: 7,
    directions: WEEKLY_INJECTION,
    strengths: [
      { label: '0.25 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 1 },
      { label: '0.5 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 2 },
      { label: '1 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 3 },
      { label: '2 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 4 },
    ],
  },
  {
    // Tirzepatide dose steps follow the licensed 4-weekly escalation. Clinical
    // data: confirm with the prescribing clinician / partner pharmacy before go-live.
    slug: 'tirzepatide-mounjaro',
    name: 'Tirzepatide',
    brandName: 'Mounjaro',
    kind: ConsultationKind.GLP1,
    category: ProductCategory.GLP1,
    form: ProductForm.INJECTION_PEN,
    coldChain: true,
    weeksPerStep: 4,
    doseIntervalDays: 7,
    directions: WEEKLY_INJECTION,
    strengths: [
      { label: '2.5 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 1 },
      { label: '5 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 2 },
      { label: '7.5 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 3 },
      { label: '10 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 4 },
      { label: '12.5 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 5 },
      { label: '15 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 6 },
    ],
  },
  {
    slug: 'estradiol-gel-oestrogel',
    name: 'Estradiol gel 0.06%',
    brandName: 'Oestrogel',
    kind: ConsultationKind.HRT,
    category: ProductCategory.ESTROGEN,
    form: ProductForm.GEL,
    doseIntervalDays: 1,
    directions: 'Apply 2 pumps once daily to the outer arm or inner thigh. Let it dry before dressing; do not apply to the breasts.',
    strengths: [{ label: '0.75 mg per pump', pack: '80 g pump dispenser (64 pumps)' }],
  },
  {
    slug: 'estradiol-gel-sandrena',
    name: 'Estradiol gel 0.1%',
    brandName: 'Sandrena',
    kind: ConsultationKind.HRT,
    category: ProductCategory.ESTROGEN,
    form: ProductForm.GEL,
    doseIntervalDays: 1,
    directions: 'Apply the contents of one sachet once daily to the lower trunk or thigh, alternating sides. Let it dry before dressing.',
    strengths: [
      { label: '0.5 mg sachet', pack: '28 sachets' },
      { label: '1 mg sachet', pack: '28 sachets' },
    ],
  },
  {
    slug: 'estradiol-patch-evorel',
    name: 'Estradiol patch',
    brandName: 'Evorel',
    kind: ConsultationKind.HRT,
    category: ProductCategory.ESTROGEN,
    form: ProductForm.PATCH,
    dosesPerWeek: 2,
    directions: 'Apply one patch twice a week to clean, dry skin below the waist, changing the patch every 3–4 days.',
    strengths: [
      { label: '25 micrograms/24 h', pack: '8 patches' },
      { label: '50 micrograms/24 h', pack: '8 patches' },
      { label: '75 micrograms/24 h', pack: '8 patches' },
      { label: '100 micrograms/24 h', pack: '8 patches' },
    ],
  },
  {
    slug: 'progesterone-utrogestan',
    name: 'Micronised progesterone',
    brandName: 'Utrogestan',
    kind: ConsultationKind.HRT,
    category: ProductCategory.PROGESTOGEN,
    form: ProductForm.CAPSULE,
    doseIntervalDays: 1,
    directions: 'Take one capsule by mouth at bedtime every night (continuous regimen).',
    strengths: [{ label: '100 mg', pack: '30 capsules' }],
  },
  {
    slug: 'testosterone-gel-tostran',
    name: 'Testosterone gel 2%',
    brandName: 'Tostran',
    kind: ConsultationKind.TRT,
    category: ProductCategory.TESTOSTERONE,
    form: ProductForm.GEL,
    doseIntervalDays: 1,
    directions: 'Apply once daily in the morning to clean, dry skin on the abdomen or inner thighs, rotating the site. Let it dry before dressing; wash hands after application.',
    // Pack size/actuation count intentionally omitted pending pharmacy
    // confirmation — the manufacturer's priming instructions mean usable
    // actuations per canister are fewer than a naive volume calculation.
    strengths: [
      { label: '20 mg (2 pumps)', pack: '60 g metered-dose pump' },
      { label: '40 mg (4 pumps)', pack: '60 g metered-dose pump' },
    ],
  },
  {
    slug: 'testosterone-injection-sustanon',
    name: 'Testosterone (mixed esters) 250 mg/mL',
    brandName: 'Sustanon 250',
    kind: ConsultationKind.TRT,
    category: ProductCategory.TESTOSTERONE,
    form: ProductForm.INJECTION_VIAL,
    doseIntervalDays: 21,
    directions: 'Inject 1 mL into the muscle (gluteal or thigh) every 3 weeks, as shown by your clinician.',
    strengths: [{ label: '250 mg/mL', pack: '1 mL ampoule' }],
  },
  {
    // Implanted in clinic — no dose interval or self-administered directions apply.
    slug: 'testosterone-pellets-testopel',
    name: 'Testosterone pellets',
    brandName: 'Testopel',
    kind: ConsultationKind.TRT,
    category: ProductCategory.TESTOSTERONE,
    form: ProductForm.PELLET,
    directions: 'Implanted subcutaneously by a clinician every 3 to 6 months. No self-administration.',
    strengths: [{ label: '75 mg pellet', pack: '6 pellets per implant procedure' }],
    // Clinic-implanted, not shipped — orders/prescribing here assume a
    // patient-administered or dispensed-and-shipped product. Inactive until
    // there's a clinic-administration fulfilment path instead of shipping.
    active: false,
  },
];

export async function seedCatalog(prisma: PrismaClient) {
  for (const p of CATALOG) {
    const data = {
      name: p.name,
      brandName: p.brandName ?? null,
      kind: p.kind,
      category: p.category,
      form: p.form,
      requiresColdChain: p.coldChain ?? false,
      weeksPerStep: p.weeksPerStep ?? null,
      doseIntervalDays: p.doseIntervalDays ?? null,
      dosesPerWeek: p.dosesPerWeek ?? null,
      defaultDirections: p.directions,
    };
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: data,
      // `active` is create-only: an admin may have withdrawn a product at
      // runtime via setProductActive, and re-running this seed must not
      // silently reactivate it.
      create: { slug: p.slug, ...data, active: p.active ?? true },
    });
    for (const [i, s] of p.strengths.entries()) {
      const strength = {
        packDescription: s.pack ?? null,
        titrationStep: s.step ?? null,
        defaultQuantity: s.qty ?? 1,
        sortOrder: i,
      };
      await prisma.productStrength.upsert({
        where: { productId_label: { productId: product.id, label: s.label } },
        update: strength,
        create: { productId: product.id, label: s.label, ...strength },
      });
    }
  }
  return CATALOG.length;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedCatalog(prisma)
    .then((n) => console.log(`✓ Catalog  ${n} products`))
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
