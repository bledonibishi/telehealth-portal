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
