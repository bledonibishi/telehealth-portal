export type BodyMeasurement = { id: string; measuredAt: string; waistCm: number | null; hipsCm: number | null; armCm: number | null };
export type MeasureKey = 'waistCm' | 'hipsCm' | 'armCm';

export const MEASURES: { key: MeasureKey; label: string; hint: string; min: number; max: number }[] = [
  { key: 'waistCm', label: 'Waist', hint: 'Narrowest point, level with your navel', min: 30, max: 250 },
  { key: 'hipsCm', label: 'Hips', hint: 'Widest part of your hips', min: 40, max: 250 },
  { key: 'armCm', label: 'Upper arm', hint: 'Middle of your relaxed upper arm', min: 10, max: 100 },
];

export type MeasureSummary = { key: MeasureKey; latestCm: number; /** Since the first time this one was measured; null when only measured once. */ changeCm: number | null };

/** For each measure ever taken: where it stands now and how far it has moved since the first time. `list` is newest first. */
export function summariseMeasurements(list: BodyMeasurement[]): MeasureSummary[] {
  const out: MeasureSummary[] = [];
  for (const { key } of MEASURES) {
    const taken = list.filter((m) => m[key] !== null);
    if (taken.length === 0) continue;
    const latest = taken[0][key]!;
    out.push({ key, latestCm: latest, changeCm: taken.length > 1 ? Number((latest - taken[taken.length - 1][key]!).toFixed(1)) : null });
  }
  return out;
}

export function cmChange(n: number) {
  if (n === 0) return 'no change';
  return `${n < 0 ? '−' : '+'}${Number(Math.abs(n).toFixed(1))} cm`;
}
