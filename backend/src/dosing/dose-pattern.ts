const DAY = 86_400_000;

/**
 * When a product's doses fall, as a repeating cycle: each cycle is
 * `cycleDays` long and has a dose at each offset (in days) from its start.
 * A weekly injection is { cycleDays: 7, offsets: [0] }; a twice-weekly patch
 * is { cycleDays: 7, offsets: [0, 3] } — the same two weekdays every week.
 */
export type DosePattern = { cycleDays: number; offsets: number[] };

export function dosePattern(product: { doseIntervalDays?: number | null; dosesPerWeek?: number | null }): DosePattern | null {
  if (product.doseIntervalDays) return { cycleDays: product.doseIntervalDays, offsets: [0] };
  const n = product.dosesPerWeek;
  if (n && n >= 1 && n <= 7) {
    // Spread as evenly as whole days allow: 2/week -> days 0 and 3 (e.g. Mon/Thu).
    return { cycleDays: 7, offsets: Array.from({ length: n }, (_, k) => Math.floor((k * 7) / n)) };
  }
  return null;
}

/**
 * Doses on fixed weekdays sit at midday UTC on their day. Stepping whole
 * 24-hour days from there can never cross midnight in any timezone within
 * ±11 hours, daylight saving included, so the weekdays a patient sees stay
 * the same all year (from 00:30 local, a clock change would move them).
 */
function middayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
}

/**
 * The next `count` dose dates in a series that started at `seriesStart`:
 * strictly after `after`, or from `seriesStart` itself (inclusive) when
 * `after` is null. Multi-dose weekly patterns are pinned to midday UTC.
 */
export function nextDoseDates(pattern: DosePattern, seriesStart: Date, after: Date | null, count: number): Date[] {
  const start = (pattern.offsets.length > 1 ? middayUtc(seriesStart) : seriesStart).getTime();
  const cycleMs = pattern.cycleDays * DAY;
  const dates: Date[] = [];
  let cycle = after ? Math.max(0, Math.floor((after.getTime() - start) / cycleMs)) : 0;
  while (dates.length < count) {
    for (const offset of pattern.offsets) {
      const t = start + cycle * cycleMs + offset * DAY;
      if (after ? t > after.getTime() : t >= start) dates.push(new Date(t));
      if (dates.length === count) break;
    }
    cycle++;
  }
  return dates;
}
