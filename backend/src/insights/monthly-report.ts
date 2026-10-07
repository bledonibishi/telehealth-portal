// The clinic's month-by-month figures: the rules for bucketing and summing, pure so they can be tested.
// Months are calendar months in UTC, so a figure never moves with the viewer's time zone.

export interface MonthBucket {
  /** "2026-10" */
  key: string;
  start: Date;
  /** Exclusive. */
  end: Date;
}

export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** The last `count` calendar months ending with the one `now` is in, newest first. */
export function monthBuckets(now: Date, count: number): MonthBucket[] {
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return { key: monthKey(start), start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
  });
}

export interface PaidInvoice {
  /** Unix seconds. */
  created: number;
  currency: string;
  amountPaid: number;
}

/** What was collected in each month, per currency, before refunds. Months with nothing collected have an empty list. */
export function revenueByMonth(invoices: PaidInvoice[], buckets: MonthBucket[]): Map<string, { currency: string; amountCents: number }[]> {
  const totals = new Map<string, Map<string, number>>(buckets.map((b) => [b.key, new Map()]));
  for (const inv of invoices) {
    const month = totals.get(monthKey(new Date(inv.created * 1000)));
    if (!month || inv.amountPaid <= 0) continue; // outside the months asked for, or a zero-value invoice
    const currency = inv.currency.toUpperCase();
    month.set(currency, (month.get(currency) ?? 0) + inv.amountPaid);
  }
  return new Map([...totals].map(([key, byCurrency]) => [key, [...byCurrency].map(([currency, amountCents]) => ({ currency, amountCents })).sort((a, b) => a.currency.localeCompare(b.currency))]));
}

/** At or above this share of starting weight lost counts as a success. */
export const SUCCESS_LOSS_PCT = 5;

export interface WeighIn {
  patientId: string;
  weightKg: number;
  at: Date;
}

export interface WeightOutcome {
  /** Patients with a check-in that month and a known starting weight. */
  patients: number;
  /** Average of how much of their starting weight they had lost at their last check-in that month. Null with nobody. */
  avgLossPct: number | null;
  /** Share of those patients at or above SUCCESS_LOSS_PCT. Null with nobody. */
  successRatePct: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Each patient counts once per month, at their last check-in of the month, against the weight they started at.
 * Someone who gained weight has a negative loss, which pulls the average down: it is not hidden.
 */
export function weightOutcomes(weighIns: WeighIn[], startingKg: Map<string, number>, buckets: MonthBucket[]): Map<string, WeightOutcome> {
  const out = new Map<string, WeightOutcome>();
  for (const b of buckets) {
    const last = new Map<string, WeighIn>();
    for (const w of weighIns) {
      if (w.at < b.start || w.at >= b.end || !startingKg.has(w.patientId)) continue;
      const seen = last.get(w.patientId);
      if (!seen || w.at > seen.at) last.set(w.patientId, w);
    }
    const losses = [...last.values()].map((w) => {
      const start = startingKg.get(w.patientId)!;
      return ((start - w.weightKg) / start) * 100;
    });
    out.set(b.key, {
      patients: losses.length,
      avgLossPct: losses.length ? round1(losses.reduce((a, b) => a + b, 0) / losses.length) : null,
      successRatePct: losses.length ? Math.round((losses.filter((l) => l >= SUCCESS_LOSS_PCT).length / losses.length) * 100) : null,
    });
  }
  return out;
}
