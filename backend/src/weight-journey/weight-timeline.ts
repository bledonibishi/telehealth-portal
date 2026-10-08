// Merging the two places a weight can live — daily entries and monthly check-ins —
// into one chronological series. Pure, so ordering and "change" rules are tested alone.

export type MeasurementKind = 'DAILY' | 'CHECK_IN';

export interface RawMeasurement {
  id: string;
  measuredAt: Date;
  weightKg: number;
  kind: MeasurementKind;
  note?: string;
  feeling?: string;
  hasPhoto?: boolean;
  /** Whether the patient may change or remove it themselves: their own entries, not a check-in or one their care team corrected. */
  patientCanEdit?: boolean;
}

export interface Measurement extends RawMeasurement {
  /** Versus the measurement before it (or the starting weight for the very first). Null when there is nothing before. */
  changeKg: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Oldest first; identical instants keep a stable order (daily entries after check-ins, then by id). */
export function sortMeasurements<T extends RawMeasurement>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      a.measuredAt.getTime() - b.measuredAt.getTime() ||
      (a.kind === b.kind ? 0 : a.kind === 'CHECK_IN' ? -1 : 1) ||
      a.id.localeCompare(b.id),
  );
}

/** `before` is the weight of the measurement immediately preceding the first item (null if none). */
export function withChanges(sorted: RawMeasurement[], before: number | null): Measurement[] {
  let prev = before;
  return sorted.map((m) => {
    const changeKg = prev === null ? null : round1(m.weightKg - prev);
    prev = m.weightKg;
    return { ...m, changeKg };
  });
}

/** The later of two candidate "latest" measurements; a daily entry wins an exact tie (it was recorded last). */
type Timed = { measuredAt: Date; kind: MeasurementKind };
export function latestOf<A extends Timed, B extends Timed>(a: A | null, b: B | null): A | B | null {
  if (!a || !b) return a ?? b;
  const d = a.measuredAt.getTime() - b.measuredAt.getTime();
  if (d !== 0) return d > 0 ? a : b;
  return a.kind === 'DAILY' ? a : b;
}
