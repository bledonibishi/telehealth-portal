/** An amount in cents as the patient reads it ("€45.00"); "now" when there is no amount yet, so "Pay now" still reads well. */
export const formatMoney = (cents: number | null | undefined, currency: string | null | undefined) => {
  if (cents == null) return 'now';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency ?? 'eur').toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency ?? ''}`;
  }
};
