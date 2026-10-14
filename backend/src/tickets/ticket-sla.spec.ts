import { REPLY_TARGET_HOURS, replyDueAt } from './ticket-sla';

const created = new Date('2026-10-14T08:00:00Z');
const base = { createdAt: created, priority: 'NORMAL' as const, status: 'OPEN' as const, firstResponseAt: null };

describe('replyDueAt', () => {
  it('is the creation time plus the allowance for its priority', () => {
    expect(replyDueAt(base)!.getTime()).toBe(created.getTime() + REPLY_TARGET_HOURS.NORMAL * 3_600_000);
    expect(replyDueAt({ ...base, priority: 'URGENT' })!.getTime()).toBe(created.getTime() + 3_600_000);
  });

  it('is shorter the more urgent it is', () => {
    expect(REPLY_TARGET_HOURS.URGENT).toBeLessThan(REPLY_TARGET_HOURS.HIGH);
    expect(REPLY_TARGET_HOURS.HIGH).toBeLessThan(REPLY_TARGET_HOURS.NORMAL);
    expect(REPLY_TARGET_HOURS.NORMAL).toBeLessThan(REPLY_TARGET_HOURS.LOW);
  });

  it('is nothing once someone has replied, or when the ticket is finished', () => {
    expect(replyDueAt({ ...base, firstResponseAt: new Date() })).toBeNull();
    expect(replyDueAt({ ...base, status: 'RESOLVED' })).toBeNull();
    expect(replyDueAt({ ...base, status: 'CLOSED' })).toBeNull();
  });
});
