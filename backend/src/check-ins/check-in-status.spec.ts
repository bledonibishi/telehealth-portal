import { checkInStatusOf } from './check-in-status';

const NOW = new Date('2026-10-14T10:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const url = (t?: string | null) => (t ? `https://app/checkin?token=${t}` : null);

describe('checkInStatusOf', () => {
  it('is READY, with the link, while a sent check-in is still open', () => {
    expect(checkInStatusOf([{ status: 'SENT', token: 't1', tokenExpiresAt: days(5), dueAt: days(-1) }], url, NOW))
      .toEqual({ state: 'READY', url: 'https://app/checkin?token=t1', nextDueAt: days(-1), lastCompletedAt: undefined });
  });

  it('is COMPLETED for two weeks after one is done, then UPCOMING with the next date', () => {
    const rows = [{ status: 'COMPLETED', completedAt: days(-3) }, { status: 'SCHEDULED', dueAt: days(25) }];
    expect(checkInStatusOf(rows, url, NOW)).toMatchObject({ state: 'COMPLETED', nextDueAt: days(25), lastCompletedAt: days(-3) });
    const later = [{ status: 'COMPLETED', completedAt: days(-20) }, { status: 'SCHEDULED', dueAt: days(8) }];
    expect(checkInStatusOf(later, url, NOW)).toMatchObject({ state: 'UPCOMING', nextDueAt: days(8) });
  });

  it('does not offer an expired link', () => {
    expect(checkInStatusOf([{ status: 'SENT', token: 't1', tokenExpiresAt: days(-1) }], url, NOW).state).toBe('UPCOMING');
  });
});
