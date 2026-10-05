// Plain arithmetic for the treatment plan card, kept pure so it can be tested on its own.

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export const PROGRAMME: Record<string, string> = {
  GLP1: 'GLP-1 Weight Loss Program',
  HRT: 'Hormone Replacement Therapy',
  TRT: 'Testosterone Replacement Therapy',
};

/** How often the medicine is taken, in words and as doses a week. */
export function frequencyOf(product: { doseIntervalDays: number | null; dosesPerWeek: number | null }, fallback: string) {
  const { doseIntervalDays: every, dosesPerWeek: perWeek } = product;
  if (every && every > 0) {
    const label = every === 1 ? 'Once a day' : every === 7 ? 'Once a week' : every === 14 ? 'Every two weeks' : `Every ${every} days`;
    return { label, dosesPerWeek: Math.round((7 / every) * 100) / 100 };
  }
  if (perWeek && perWeek > 0) return { label: perWeek === 1 ? 'Once a week' : perWeek === 2 ? 'Twice a week' : `${perWeek} times a week`, dosesPerWeek: perWeek };
  return { label: fallback, dosesPerWeek: null };
}

export function planSpan(startedAt: Date, validUntil: Date | null, dosesPerWeek: number | null, now = new Date()) {
  const weeksElapsed = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / WEEK_MS));
  const durationWeeks = validUntil ? Math.max(1, Math.round((validUntil.getTime() - startedAt.getTime()) / WEEK_MS)) : null;
  const dosesPlanned = durationWeeks && dosesPerWeek ? Math.round(durationWeeks * dosesPerWeek) : null;
  return { weeksElapsed, durationWeeks, dosesPlanned };
}

/**
 * Doses in the supply the patient has now: the ones scheduled between the last shipment and the next one.
 * When the schedule hasn't been written that far ahead yet, the count expected from the dose frequency stands in.
 */
export function supplyDoses(scheduled: Array<{ status: string }>, cycleDays: number, dosesPerWeek: number | null) {
  const expected = dosesPerWeek ? Math.max(1, Math.round((cycleDays / 7) * dosesPerWeek)) : 0;
  const total = Math.max(scheduled.length, expected);
  const taken = scheduled.filter((d) => d.status === 'TAKEN').length;
  return total ? { total, taken: Math.min(taken, total) } : null;
}
