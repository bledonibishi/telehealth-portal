export const FEELINGS = [
  { value: 'GREAT', emoji: '😊', label: 'Feeling great' },
  { value: 'GOOD', emoji: '🙂', label: 'Feeling good' },
  { value: 'OKAY', emoji: '😐', label: 'Feeling okay' },
  { value: 'DIFFICULTIES', emoji: '😕', label: 'Having some difficulties' },
  { value: 'NOT_WELL', emoji: '😟', label: 'Not feeling well' },
] as const;

export const feelingOf = (value?: string | null) => FEELINGS.find((f) => f.value === value);

/** 105 → "105 kg", 104.5 → "104.5 kg" */
export const kg = (n?: number | null) => (n === null || n === undefined ? '—' : `${Number(n.toFixed(1))} kg`);

/** "−6 kg" / "+1.5 kg" / "no change" */
export function kgChange(n: number) {
  if (n === 0) return 'no change';
  return `${n < 0 ? '−' : '+'}${Number(Math.abs(n).toFixed(1))} kg`;
}

/** A general guide for steady loss, not a promise: about half a kilo to a kilo a week. */
export const STEADY_LOSS_KG_PER_WEEK = { slow: 0.5, fast: 1 } as const;

export type TargetPlan =
  | { kind: 'LOSE'; toLoseKg: number; fastestAt: Date; slowestAt: Date; /** 0–100 of the way from the start to the target. */ percent: number | null }
  | { kind: 'AT_OR_ABOVE'; };

/**
 * What a target weight means from where the patient is now: how much to lose and when a steady pace
 * would get them there. `startKg` (the weight they began at) only places the progress marker.
 */
export function targetPlan(currentKg: number, targetKg: number, startKg: number | null | undefined, now: Date): TargetPlan {
  const toLose = currentKg - targetKg;
  if (!(toLose > 0)) return { kind: 'AT_OR_ABOVE' };
  const at = (kgPerWeek: number) => new Date(now.getTime() + Math.ceil(toLose / kgPerWeek) * 7 * 86_400_000);
  const span = startKg != null ? startKg - targetKg : 0;
  const percent = span > 0 ? Math.min(100, Math.max(0, ((startKg! - currentKg) / span) * 100)) : null;
  return {
    kind: 'LOSE',
    toLoseKg: Number(toLose.toFixed(1)),
    fastestAt: at(STEADY_LOSS_KG_PER_WEEK.fast),
    slowestAt: at(STEADY_LOSS_KG_PER_WEEK.slow),
    percent,
  };
}
