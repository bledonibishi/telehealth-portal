/**
 * How a patient pays: once per supply, or on a subscription that renews by itself and costs less.
 * The monthly price in Stripe is the one-time price; the subscription is that price less this discount.
 */
export type BillingChoice = 'ONE_TIME' | 'SUBSCRIPTION';

export const SUBSCRIPTION_DISCOUNT_PERCENT = 10;

/** The monthly subscription amount (in cents) for a one-time amount, rounded to the nearest cent. */
export function subscriptionAmount(oneTimeCents: number): number {
  return Math.round((oneTimeCents * (100 - SUBSCRIPTION_DISCOUNT_PERCENT)) / 100);
}

export function parseBillingChoice(value: unknown): BillingChoice | undefined {
  return value === 'ONE_TIME' || value === 'SUBSCRIPTION' ? value : undefined;
}
