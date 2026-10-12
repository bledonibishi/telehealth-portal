import { Prisma } from '@prisma/client';
import { ProductCategory } from '../common/enums';

// The real client or a transaction; only products are read.
type Db = Pick<Prisma.TransactionClient, 'product'>;

export interface OrderedDose {
  category: string;
  productId: string;
  productSlug: string;
  productName: string;
  strengthId: string;
  label: string;
  step: number | null;
  stripePriceId: string | null;
  ladder: Array<{ label: string; step: number }>;
}

/** The answer the checkout stores on the lead for what was bought, e.g. "Mounjaro 7.5 mg" (see CheckoutService). */
export function orderedTreatmentText(leadQuizAnswers: unknown): string | null {
  if (!Array.isArray(leadQuizAnswers)) return null;
  return (leadQuizAnswers as Array<{ questionId?: string; answer?: string }>).find((a) => a.questionId === 'preferred_treatment')?.answer ?? null;
}

/**
 * The product and strength a free-text order names — "Mounjaro 7.5 mg", "Evorel 50 micrograms/24 h", or a
 * product and dose sent separately by the checkout — among products of the given categories. Null when
 * it doesn't name a strength in the catalog.
 */
export async function findDose(db: Db, text: string | null | undefined, categories: ProductCategory[]): Promise<OrderedDose | null> {
  if (!text?.trim()) return null;
  const lower = text.toLowerCase();
  const products = await db.product.findMany({
    where: { category: { in: categories } },
    include: { strengths: { where: { active: true } } },
  });
  const product = products.find((p) => [p.brandName, p.name].some((n) => n && lower.includes(n.toLowerCase())));
  if (!product) return null;
  // Longest label first, so "12.5 mg" isn't read as "2.5 mg".
  const strength = [...product.strengths].sort((a, b) => b.label.length - a.label.length).find((s) => lower.includes(s.label.toLowerCase()));
  if (!strength) return null;
  return {
    category: product.category,
    productId: product.id,
    productSlug: product.slug,
    productName: product.brandName ?? product.name,
    strengthId: strength.id,
    label: strength.label,
    step: strength.titrationStep,
    stripePriceId: strength.stripePriceId,
    ladder: product.strengths.filter((s) => s.titrationStep !== null).map((s) => ({ label: s.label, step: s.titrationStep! })),
  };
}

/** The GLP-1 product and strength a free-text order names. Null when it doesn't name a GLP-1 strength in the catalog. */
export const findGlp1Dose = (db: Db, text: string | null | undefined) => findDose(db, text, [ProductCategory.GLP1]);

/** The Stripe price of the progesterone add-on sold with HRT (its first priced, active strength). */
export async function findProgesteronePriceId(db: Db): Promise<string | null> {
  const strength = await db.product.findFirst({
    where: { category: ProductCategory.PROGESTOGEN, active: true },
    include: { strengths: { where: { active: true, stripePriceId: { not: null } }, orderBy: { sortOrder: 'asc' }, take: 1 } },
  });
  return strength?.strengths[0]?.stripePriceId ?? null;
}

/** The progesterone add-on sold with HRT: its product and first active strength, to pre-select it. */
export async function findProgesteroneStrength(db: Db): Promise<{ productId: string; strengthId: string } | null> {
  const product = await db.product.findFirst({
    where: { category: ProductCategory.PROGESTOGEN, active: true },
    include: { strengths: { where: { active: true }, orderBy: { sortOrder: 'asc' }, take: 1 } },
  });
  const strength = product?.strengths[0];
  return product && strength ? { productId: product.id, strengthId: strength.id } : null;
}
