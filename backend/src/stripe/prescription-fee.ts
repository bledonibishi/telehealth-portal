/**
 * The doctor's fee for writing a prescription. It is its own line wherever a patient pays, so it is visible, and it is
 * the part of a payment that is not returned in a refund once the prescription exists: the doctor's work can't be undone.
 */
export const PRESCRIPTION_FEE_LABEL = 'Prescription fee';
export const PRESCRIPTION_FEE_CURRENCY = 'eur';
const DEFAULT_FEE_CENTS = 4000;

/** The fee in cents. Set PRESCRIPTION_FEE_CENTS to change it; 0 switches the fee off. */
export function prescriptionFeeCents(config: { get<T = string>(key: string): T | undefined } | undefined): number {
  const raw = config?.get<string>('PRESCRIPTION_FEE_CENTS');
  if (raw == null || String(raw).trim() === '') return DEFAULT_FEE_CENTS;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_FEE_CENTS;
}

/** The fee only applies to payments in its own currency: a price in another currency is charged without it. */
export const feeApplies = (feeCents: number, currency: string | undefined) => feeCents > 0 && currency?.toLowerCase() === PRESCRIPTION_FEE_CURRENCY;

/** An invoice line that is the prescription fee (it is told apart by its name, which only we write). */
export const isFeeLine = (line: { description?: string | null }) => /prescription fee/i.test(line.description ?? '');

/** What an invoice charged as prescription fee, in cents. */
export function feeInInvoice(invoice: { lines?: { data?: Array<{ description?: string | null; amount?: number | null }> } }): number {
  return (invoice.lines?.data ?? []).filter(isFeeLine).reduce((sum, l) => sum + (l.amount ?? 0), 0);
}

let cachedProductId: string | undefined;

/**
 * The Stripe product the monthly fee line is billed under (a subscription line needs an existing product). Found by name,
 * or made on first use, and remembered. Two servers making it at once leave two products with the same name, which is harmless.
 */
export async function feeProductId(stripe: {
  products: {
    search(p: { query: string; limit?: number }): Promise<{ data: Array<{ id: string }> }>;
    create(p: { name: string; metadata?: Record<string, string> }): Promise<{ id: string }>;
  };
}): Promise<string> {
  if (cachedProductId) return cachedProductId;
  const found = await stripe.products.search({ query: `active:'true' AND name:'${PRESCRIPTION_FEE_LABEL}'`, limit: 1 }).catch(() => ({ data: [] as Array<{ id: string }> }));
  cachedProductId = found.data[0]?.id ?? (await stripe.products.create({ name: PRESCRIPTION_FEE_LABEL, metadata: { kind: 'PRESCRIPTION_FEE' } })).id;
  return cachedProductId;
}
