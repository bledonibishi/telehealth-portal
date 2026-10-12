import { differenceInCalendarDays } from 'date-fns';

export type ScoreKey = 'nausea' | 'vomiting' | 'abdominalPain' | 'diarrhoea' | 'constipation' | 'fatigue';

/** The symptoms asked about each week, in the order shown. Same keys as the backend. */
export const SCORES: { key: ScoreKey; label: string }[] = [
  { key: 'nausea', label: 'Nausea' },
  { key: 'vomiting', label: 'Vomiting' },
  { key: 'abdominalPain', label: 'Stomach pain' },
  { key: 'diarrhoea', label: 'Diarrhoea' },
  { key: 'constipation', label: 'Constipation' },
  { key: 'fatigue', label: 'Tiredness' },
];

export const HIGH_SCORE = 7;
/** A new entry is asked for once a week has passed. */
export const DUE_AFTER_DAYS = 7;

export type ScoreEntry = { id: string; recordedAt: string; note?: string | null } & Record<ScoreKey, number>;

/** Whether it is time to ask again: never logged, or the last entry is a week old or more. */
export function isScoreCheckDue(entries: { recordedAt: string }[], now: Date = new Date()): boolean {
  if (entries.length === 0) return true;
  const latest = entries.reduce((a, b) => (a.recordedAt > b.recordedAt ? a : b));
  return differenceInCalendarDays(now, new Date(latest.recordedAt)) >= DUE_AFTER_DAYS;
}

/** What the number means, for the screen reader and the label under the slider. */
export const describeScore = (n: number) => (n <= 1 ? 'none' : n <= 3 ? 'mild' : n <= 6 ? 'moderate' : n <= 8 ? 'strong' : 'the worst');
