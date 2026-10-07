import { HIGH_SCORE, STALE_AFTER_DAYS, alertSeverityFor, attentionReasons, summariseScores, type ScoreEntry } from './side-effect-scores';

const DAY = 86_400_000;
const NOW = new Date('2026-10-30T12:00:00Z');
const entry = (daysAgo: number, over: Partial<Record<string, number>> = {}, id = `e-${daysAgo}`): ScoreEntry =>
  ({ id, recordedAt: new Date(NOW.getTime() - daysAgo * DAY), nausea: 1, vomiting: 1, abdominalPain: 1, diarrhoea: 1, constipation: 1, fatigue: 1, ...over }) as ScoreEntry;

describe('summariseScores', () => {
  it('has no rows for a patient who has never logged, and says the picture is out of date', () => {
    expect(summariseScores([], NOW)).toEqual({ lastLoggedAt: null, daysSinceLastLog: null, stale: true, rows: [] });
  });

  it('reads the latest entry against the one before it and the 28-day peak', () => {
    const { rows } = summariseScores([entry(2, { nausea: 4 }), entry(9, { nausea: 8 }), entry(16, { nausea: 2 })], NOW);
    expect(rows.find((r) => r.key === 'nausea')).toMatchObject({ latest: 4, previous: 8, peak: 8, flagged: false, rising: false });
  });

  it('does not count an entry older than 28 days towards the peak', () => {
    const { rows } = summariseScores([entry(1, { vomiting: 2 }), entry(40, { vomiting: 9 })], NOW);
    expect(rows.find((r) => r.key === 'vomiting')?.peak).toBe(2);
  });

  it('flags a high score, and a sharp rise even when it is not yet high', () => {
    const { rows } = summariseScores([entry(1, { nausea: HIGH_SCORE, abdominalPain: 5 }), entry(8, { nausea: 7, abdominalPain: 2 })], NOW);
    expect(rows.find((r) => r.key === 'nausea')).toMatchObject({ flagged: true, rising: false });
    expect(rows.find((r) => r.key === 'abdominalPain')).toMatchObject({ flagged: false, rising: true });
  });

  it('is stale once the last entry is older than a week plus a few days', () => {
    expect(summariseScores([entry(STALE_AFTER_DAYS)], NOW).stale).toBe(false);
    expect(summariseScores([entry(STALE_AFTER_DAYS + 1)], NOW).stale).toBe(true);
  });
});

describe('attentionReasons', () => {
  const none = { unacknowledgedReports: [], roughDoses: 0 };

  it('is empty when nothing stands out', () => {
    expect(attentionReasons(summariseScores([entry(1, { nausea: 3 })], NOW), none)).toEqual([]);
  });

  it('says in words what is high, what rose, what was reported and how doses went', () => {
    const summary = summariseScores([entry(1, { nausea: 8, fatigue: 5 }), entry(8, { nausea: 6, fatigue: 1 })], NOW);
    expect(attentionReasons(summary, { unacknowledgedReports: [{ severity: 'SEVERE' }, { severity: 'MILD' }], roughDoses: 2 })).toEqual([
      'Nausea 8/10 at the last check',
      'Tiredness up from 1 to 5',
      '1 reported side effect not yet acknowledged',
      'Felt unwell after 2 recent doses',
    ]);
  });

  it('flags a serious report even when the patient has never used the tracker', () => {
    expect(attentionReasons(summariseScores([], NOW), { unacknowledgedReports: [{ severity: 'MODERATE' }], roughDoses: 0 })).toEqual(['1 reported side effect not yet acknowledged']);
  });
});

describe('alertSeverityFor', () => {
  const scores = (worst: number) => ({ nausea: worst, vomiting: 1, abdominalPain: 1, diarrhoea: 1, constipation: 1, fatigue: 1 });
  it('raises nothing below 7, a moderate alert from 7, a severe one from 9', () => {
    expect(alertSeverityFor(scores(6))).toBeNull();
    expect(alertSeverityFor(scores(7))).toBe('MODERATE');
    expect(alertSeverityFor(scores(8))).toBe('MODERATE');
    expect(alertSeverityFor(scores(9))).toBe('SEVERE');
  });
});
