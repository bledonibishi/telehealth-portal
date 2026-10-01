export const FEELINGS: Record<string, { emoji: string; label: string }> = {
  GREAT: { emoji: '😊', label: 'Feeling great' },
  GOOD: { emoji: '🙂', label: 'Feeling good' },
  OKAY: { emoji: '😐', label: 'Feeling okay' },
  DIFFICULTIES: { emoji: '😕', label: 'Having some difficulties' },
  NOT_WELL: { emoji: '😟', label: 'Not feeling well' },
};

/** 105 → "105 kg", 104.5 → "104.5 kg" */
export const kg = (n?: number | null) => (n === null || n === undefined ? '—' : `${Number(n.toFixed(1))} kg`);

export const kgChange = (n: number) => (n === 0 ? 'no change' : `${n < 0 ? '−' : '+'}${Number(Math.abs(n).toFixed(1))} kg`);
