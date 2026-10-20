export type BillingChoice = 'ONE_TIME' | 'SUBSCRIPTION';

/** The saving for subscribing; the server charges the discounted amount (backend/src/stripe/billing-choice.ts). */
export const SUBSCRIPTION_DISCOUNT_PERCENT = 10;

/**
 * What a buyer has picked until they choose: the subscription, which is the cheaper option. It is shown selected, in green,
 * with the one-time price beside it. (The renewal is spelled out next to the choice and the pay button; the wording is
 * not yet checked against Kosovo or EU consumer law, so review the default with a lawyer.)
 */
export const DEFAULT_BILLING: BillingChoice = 'SUBSCRIPTION';

/**
 * The wording around the choice. Kept together so it can be reviewed, and changed, in one place before launch
 * (it has not been checked against Kosovo or EU consumer law yet).
 */
export const BILLING_COPY = {
  oncePrice: 'One payment for one month’s supply. You pay again for each supply after your check-in.',
  subscriptionPrice: `Billed every month and renews automatically. Cancel any time from Settings; you keep the month you’ve paid for.`,
  subscribeBadge: `Save ${SUBSCRIPTION_DISCOUNT_PERCENT}%`,
  // Shown next to the pay button when a subscription is chosen.
  renewalNote: 'Your subscription renews every month until you cancel. You can cancel any time from Settings, and ask for a refund.',
  onceNote: 'This is a single payment: nothing renews by itself.',
  // The doctor's fee is its own line. It is kept in a refund once a prescription has been written, because that work can't be undone.
  feeNote: 'The prescription fee pays the doctor who reviews you and writes your prescription. If you ask for a refund after your prescription has been written, the fee is not returned, because that work cannot be undone. Everything else is. If you come back to the same prescription within 15 days of it being written, you pay for the medicine only, not the fee again.',
} as const;
