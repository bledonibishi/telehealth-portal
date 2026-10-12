// The weekly side-effect scores: which symptoms are asked about, and how a run of entries is read for the doctor.
// Pure, so the rules live here and both apps only show what the API returns.

export const SCORE_KEYS = ['nausea', 'vomiting', 'abdominalPain', 'diarrhoea', 'constipation', 'fatigue'] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const SCORE_LABEL: Record<ScoreKey, string> = {
  nausea: 'Nausea',
  vomiting: 'Vomiting',
  abdominalPain: 'Stomach pain',
  diarrhoea: 'Diarrhoea',
  constipation: 'Constipation',
  fatigue: 'Tiredness',
};

/** The matching key in the ad-hoc side-effect report list, so a high score can raise the same alert. */
export const REPORT_KEY: Record<ScoreKey, string> = {
  nausea: 'nausea',
  vomiting: 'vomiting',
  abdominalPain: 'abdominal_pain',
  diarrhoea: 'diarrhoea',
  constipation: 'constipation',
  fatigue: 'fatigue',
};

export const MIN_SCORE = 1;
export const MAX_SCORE = 10;
/** From this score a symptom needs the doctor's attention. */
export const HIGH_SCORE = 7;
/** From this score the report raised for the doctor is SEVERE rather than MODERATE. */
export const SEVERE_SCORE = 9;
/** A symptom that went up by this much since the last entry is flagged even if it is not yet high. */
export const RISE_FLAG = 3;
/** How far back the peak is taken from. */
export const PEAK_DAYS = 28;
/** Weekly, with a few days' grace: older than this and the doctor is told the picture may be out of date. */
export const STALE_AFTER_DAYS = 10;
export const MAX_NOTE_LENGTH = 500;
/** Starts the note of the report a high weekly score raises, so that report can be told apart from one the patient wrote. */
export const TRACKER_NOTE_PREFIX = 'Weekly tracker:';
export const MAX_ENTRIES_PER_DAY = 3;

export type ScoreEntry = { id: string; recordedAt: Date } & Record<ScoreKey, number> & { note?: string | null };

export interface ScoreRow {
  key: ScoreKey;
  label: string;
  latest: number;
  previous: number | null;
  peak: number;
  flagged: boolean;
  rising: boolean;
}

export interface ScoreSummary {
  lastLoggedAt: Date | null;
  daysSinceLastLog: number | null;
  stale: boolean;
  rows: ScoreRow[];
}

const DAY = 86_400_000;

/** `entries` newest first. No entries gives no rows: not logging is not the same as having no side effects. */
export function summariseScores(entries: ScoreEntry[], now: Date = new Date()): ScoreSummary {
  const latest = entries[0];
  if (!latest) return { lastLoggedAt: null, daysSinceLastLog: null, stale: true, rows: [] };
  const previous = entries[1];
  const since = now.getTime() - PEAK_DAYS * DAY;
  const recent = entries.filter((e) => e.recordedAt.getTime() >= since);
  const daysSinceLastLog = Math.floor((now.getTime() - latest.recordedAt.getTime()) / DAY);
  return {
    lastLoggedAt: latest.recordedAt,
    daysSinceLastLog,
    stale: daysSinceLastLog > STALE_AFTER_DAYS,
    rows: SCORE_KEYS.map((key) => ({
      key,
      label: SCORE_LABEL[key],
      latest: latest[key],
      previous: previous ? previous[key] : null,
      peak: Math.max(...recent.map((e) => e[key]), latest[key]),
      flagged: latest[key] >= HIGH_SCORE,
      rising: previous != null && latest[key] - previous[key] >= RISE_FLAG,
    })),
  };
}

/** Why the doctor should look before approving, in plain words. Empty when there is nothing to flag. */
export function attentionReasons(
  summary: ScoreSummary,
  extra: { unacknowledgedReports: { severity: string }[]; roughDoses: number },
): string[] {
  const reasons: string[] = [];
  for (const r of summary.rows) {
    if (r.flagged) reasons.push(`${r.label} ${r.latest}/10 at the last check`);
    else if (r.rising) reasons.push(`${r.label} up from ${r.previous} to ${r.latest}`);
  }
  const serious = extra.unacknowledgedReports.filter((r) => r.severity === 'SEVERE' || r.severity === 'MODERATE').length;
  if (serious > 0) reasons.push(serious === 1 ? '1 reported side effect not yet acknowledged' : `${serious} reported side effects not yet acknowledged`);
  if (extra.roughDoses > 0) reasons.push(extra.roughDoses === 1 ? 'Felt unwell after 1 recent dose' : `Felt unwell after ${extra.roughDoses} recent doses`);
  return reasons;
}

/** The severity of the alert a high score raises, or null when no score is high. */
export function alertSeverityFor(entry: Record<ScoreKey, number>): 'MODERATE' | 'SEVERE' | null {
  const worst = Math.max(...SCORE_KEYS.map((k) => entry[k]));
  if (worst >= SEVERE_SCORE) return 'SEVERE';
  return worst >= HIGH_SCORE ? 'MODERATE' : null;
}

export const isValidScore = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= MIN_SCORE && (n as number) <= MAX_SCORE;
