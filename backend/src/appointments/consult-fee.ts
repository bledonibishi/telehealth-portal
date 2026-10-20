/**
 * The fee for an extra live consultation (video or in person) that a patient chooses to book. The monthly check-in,
 * messages and safety questions stay free: anything that may be a medical problem is never put behind a payment.
 */
export const CONSULT_FEE_LABEL = 'Extra consultation';
export const CONSULT_FEE_CURRENCY = 'eur';
/** Reasons that are about the patient's safety, never charged. */
export const FREE_REASONS = ['SIDE_EFFECT', 'PAIN'] as const;
/** An unpaid request is withdrawn after this many days. */
export const CONSULT_PAYMENT_DAYS = 7;

/** The fee in cents. Set CONSULT_FEE_CENTS to charge; unset or 0 means consultations are free. */
export function consultFeeCents(config: { get<T = string>(key: string): T | undefined } | undefined): number {
  const n = Number(config?.get<string>('CONSULT_FEE_CENTS'));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Whether a request is charged: a routine one, with no warning signs, about something other than a symptom. */
export function consultIsCharged(feeCents: number, r: { reason: string; urgency: string; emergencyAdvised: boolean }): boolean {
  return feeCents > 0 && r.urgency !== 'URGENT' && !r.emergencyAdvised && !(FREE_REASONS as readonly string[]).includes(r.reason);
}
