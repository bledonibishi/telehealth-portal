export type BodyMeasurement = { id: string; measuredAt: string; waistCm: number | null; hipsCm: number | null; armCm: number | null };
export type MeasureKey = 'waistCm' | 'hipsCm' | 'armCm';

export const MEASURES: { key: MeasureKey; label: string; hint: string; min: number; max: number }[] = [
  { key: 'waistCm', label: 'Waist', hint: 'Around the narrowest point, level with your navel', min: 30, max: 250 },
  { key: 'hipsCm', label: 'Hips', hint: 'Around the widest part of your hips', min: 40, max: 250 },
  { key: 'armCm', label: 'Upper arm', hint: 'Around the middle of your relaxed upper arm', min: 10, max: 100 },
];

export type MeasureSummary = { key: MeasureKey; latestCm: number; at: string; /** Since the first time this one was measured; null when it has only been measured once. */ changeCm: number | null };

/** For each measure ever taken: where it stands now and how far it has moved since the first time. `list` is newest first. */
export function summariseMeasurements(list: BodyMeasurement[]): MeasureSummary[] {
  const out: MeasureSummary[] = [];
  for (const { key } of MEASURES) {
    const taken = list.filter((m) => m[key] !== null);
    if (taken.length === 0) continue;
    const latest = taken[0];
    const first = taken[taken.length - 1];
    out.push({
      key,
      latestCm: latest[key]!,
      at: latest.measuredAt,
      changeCm: taken.length > 1 ? Number((latest[key]! - first[key]!).toFixed(1)) : null,
    });
  }
  return out;
}

/** "−4.5 cm" / "+1 cm" / "no change" */
export function cmChange(n: number) {
  if (n === 0) return 'no change';
  return `${n < 0 ? '−' : '+'}${Number(Math.abs(n).toFixed(1))} cm`;
}
