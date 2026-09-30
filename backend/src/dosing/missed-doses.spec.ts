import { missedStreak, needsRetitrationReview, retitrationFlag } from './missed-doses';

const d = (iso: string) => new Date(`${iso}T09:00:00Z`);
const ev = (iso: string, status: string) => ({ scheduledFor: d(iso), status, takenAt: status === 'TAKEN' ? d(iso) : null });

describe('missedStreak', () => {
  it('counts not-taken doses back to the last one taken', () => {
    const streak = missedStreak([ev('2026-09-01', 'TAKEN'), ev('2026-09-08', 'MISSED'), ev('2026-09-15', 'SKIPPED'), ev('2026-09-22', 'SCHEDULED')]);
    expect(streak).toEqual({ count: 2, since: d('2026-09-08'), lastTakenAt: d('2026-09-01') });
  });

  it('is zero when the latest logged dose was taken, whatever came before', () => {
    expect(missedStreak([ev('2026-09-01', 'MISSED'), ev('2026-09-08', 'MISSED'), ev('2026-09-15', 'TAKEN')]).count).toBe(0);
  });

  it('ignores doses scheduled in the future, even if already marked', () => {
    const now = d('2026-09-20');
    const streak = missedStreak([ev('2026-09-01', 'TAKEN'), ev('2026-09-08', 'MISSED'), ev('2026-09-15', 'MISSED'), ev('2026-09-22', 'TAKEN')], now);
    expect(streak.count).toBe(2);
  });

  it('handles unsorted input and a patient who has never taken a dose', () => {
    const streak = missedStreak([ev('2026-09-15', 'MISSED'), ev('2026-09-08', 'MISSED')]);
    expect(streak).toEqual({ count: 2, since: d('2026-09-08'), lastTakenAt: null });
  });
});

describe('needsRetitrationReview', () => {
  const two = { count: 2, since: d('2026-09-08'), lastTakenAt: null };
  it('needs 2+ in a row on a stepped-up dose', () => {
    expect(needsRetitrationReview(two, 3)).toBe(true);
    expect(needsRetitrationReview({ ...two, count: 1 }, 3)).toBe(false);
  });
  it('ignores the starting dose and untitrated products', () => {
    expect(needsRetitrationReview(two, 1)).toBe(false);
    expect(needsRetitrationReview(two, null)).toBe(false);
  });
  it('describes the streak in the flag', () => {
    expect(retitrationFlag(two, '1 mg')).toEqual({
      severity: 'WARNING',
      description: '2 doses in a row not taken since 2026-09-08 while on 1 mg — consider restarting at a lower dose rather than continuing at this one',
    });
  });
});
