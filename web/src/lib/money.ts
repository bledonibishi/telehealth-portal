/**
 * An amount in cents as the patient reads it ("€45.00"); "now" when there is no amount yet, so "Pay now" still reads well.
 * `wholeWithoutCents` writes a round amount as "€20" (a reward), and keeps the cents otherwise.
 */
export const formatMoney = (cents: number | null | undefined, currency: string | null | undefined, { wholeWithoutCents = false } = {}) => {
  if (cents == null) return 'now';
  const digits = wholeWithoutCents && cents % 100 === 0 ? 0 : 2;
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency ?? 'eur').toUpperCase(), minimumFractionDigits: digits, maximumFractionDigits: digits }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency ?? ''}`;
  }
};
