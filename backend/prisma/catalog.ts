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
  directions: string;
  strengths: StrengthSeed[];
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
    directions: WEEKLY_INJECTION,
    strengths: [
      { label: '0.25 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 1 },
      { label: '0.5 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 2 },
      { label: '1 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 3 },
      { label: '2 mg', pack: 'Pre-filled pen, 4 weekly doses', step: 4 },
    ],
  },
  {
    slug: 'estradiol-gel-oestrogel',
    name: 'Estradiol gel 0.06%',
    brandName: 'Oestrogel',
    kind: ConsultationKind.HRT,
    category: ProductCategory.ESTROGEN,
    form: ProductForm.GEL,
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
    directions: 'Take one capsule by mouth at bedtime every night (continuous regimen).',
    strengths: [{ label: '100 mg', pack: '30 capsules' }],
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
      defaultDirections: p.directions,
    };
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: data,
      create: { slug: p.slug, ...data },
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
