import { calendarDaysBetween, hoursSince } from './format';

export type Dose = {
  id: string;
  scheduledFor: string;
  status: 'SCHEDULED' | 'TAKEN' | 'MISSED' | 'SKIPPED';
  takenAt?: string | null;
  note?: string | null;
  injectionSite?: string | null;
  feelingAfter?: string | null;
  product: { id: string; name: string; brandName?: string | null; form: string; category: string; requiresColdChain: boolean };
  strength: { id: string; label: string; titrationStep?: number | null };
};

export const doseName = (d: Dose) => `${d.product.brandName ?? d.product.name} ${d.strength.label}`;
/** Pens for the weight-loss medicines: where the site picker and the how-to apply. */
export const isRotatingPen = (d: Dose) => d.product.category === 'GLP1' && d.product.form === 'INJECTION_PEN';

export type VisualStatus = 'SCHEDULED' | 'DUE' | 'TAKEN' | 'MISSED' | 'SKIPPED';
/** A scheduled dose from an earlier day that was never logged reads as "due". */
export function visualStatus(d: Dose, now: Date = new Date()): VisualStatus {
  if (d.status === 'SCHEDULED' && calendarDaysBetween(d.scheduledFor, now) < 0) return 'DUE';
  return d.status;
}

// How long after the scheduled day a missed weekly dose can still be taken, per the product's licence
// (semaglutide: within 5 days; otherwise skip to the next one). Products not listed get "ask your clinician".
const LATE_DOSE_WINDOW_DAYS: Record<string, number> = { Semaglutide: 5 };

export function missedDoseAdvice(d: Dose, needsClinician: boolean, now: Date = new Date()): string | null {
  if (d.product.category !== 'GLP1') return null;
  const daysLate = -calendarDaysBetween(d.scheduledFor, now);
  if (daysLate < 1) return null;
  if (needsClinician) return 'You’ve missed several doses in a row. Please message your clinician before taking this or your next dose.';
  const window = LATE_DOSE_WINDOW_DAYS[d.product.name];
  if (window === undefined) return 'Missed this dose? Message your clinician for advice before taking it late.';
  return daysLate <= window
    ? `Missed it? You can still take it today. It’s within ${window} days of the scheduled day. Then carry on with your usual day.`
    : `It’s more than ${window} days since this dose was due, so skip it and take your next one on your usual day. Never take two doses to catch up.`;
}

export const OVERDUE_ALERT_HOURS = 48;
/** A dose two or more days past due and still not logged, when no later one has been dealt with. */
export function overdueDose(doses: Dose[], now: Date = new Date()): Dose | null {
  const latestPast = doses.filter((d) => new Date(d.scheduledFor) <= now).sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))[0];
  if (!latestPast || (latestPast.status !== 'SCHEDULED' && latestPast.status !== 'MISSED')) return null;
  return hoursSince(latestPast.scheduledFor, now) >= OVERDUE_ALERT_HOURS ? latestPast : null;
}

export const ASK_AFTER_HOURS = 20;
export const ASK_UNTIL_HOURS = 7 * 24;
/** The latest taken dose, about a day old, that the patient has not yet said how they felt after. */
export function doseToAskAbout(doses: Dose[], now: Date = new Date()): Dose | null {
  return (
    doses
      .filter((d) => d.status === 'TAKEN' && d.takenAt && !d.feelingAfter)
      .filter((d) => { const h = hoursSince(d.takenAt!, now); return h >= ASK_AFTER_HOURS && h < ASK_UNTIL_HOURS; })
      .sort((a, b) => b.takenAt!.localeCompare(a.takenAt!))[0] ?? null
  );
}
