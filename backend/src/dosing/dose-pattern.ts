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
 * The next `count` dose dates in a series that started at `seriesStart`:
 * strictly after `after`, or from `seriesStart` itself (inclusive) when
 * `after` is null.
 */
export function nextDoseDates(pattern: DosePattern, seriesStart: Date, after: Date | null, count: number): Date[] {
  const start = seriesStart.getTime();
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
