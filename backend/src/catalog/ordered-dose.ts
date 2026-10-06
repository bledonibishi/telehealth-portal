import { Prisma } from '@prisma/client';
import { ProductCategory } from '../common/enums';

// The real client or a transaction; only products are read.
type Db = Pick<Prisma.TransactionClient, 'product'>;

export interface OrderedDose {
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
 * The GLP-1 product and strength a free-text order names — "Mounjaro 7.5 mg", or a product and dose
 * sent separately by the checkout. Null when it doesn't name a GLP-1 strength in the catalog.
 */
export async function findGlp1Dose(db: Db, text: string | null | undefined): Promise<OrderedDose | null> {
  if (!text?.trim()) return null;
  const lower = text.toLowerCase();
  const products = await db.product.findMany({
    where: { category: ProductCategory.GLP1 },
    include: { strengths: { where: { active: true } } },
  });
  const product = products.find((p) => [p.brandName, p.name].some((n) => n && lower.includes(n.toLowerCase())));
  if (!product) return null;
  // Longest label first, so "12.5 mg" isn't read as "2.5 mg".
  const strength = [...product.strengths].sort((a, b) => b.label.length - a.label.length).find((s) => lower.includes(s.label.toLowerCase()));
  if (!strength) return null;
  return {
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
