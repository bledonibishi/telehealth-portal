import { SUCCESS_LOSS_PCT, monthBuckets, monthKey, revenueByMonth, weightOutcomes } from './monthly-report';
import { MonthlyReportService } from './monthly-report.service';

const NOW = new Date('2026-10-15T12:00:00Z');
const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

describe('monthBuckets', () => {
  it('lists the last months newest first, across a year boundary', () => {
    expect(monthBuckets(new Date('2026-02-10T00:00:00Z'), 4).map((b) => b.key)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
  });

  it('runs from the first of the month to the first of the next, in UTC', () => {
    const [oct] = monthBuckets(NOW, 1);
    expect(oct.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(oct.end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('puts an instant at the very end of a month in that month', () => {
    expect(monthKey(new Date('2026-09-30T23:59:59Z'))).toBe('2026-09');
    expect(monthKey(new Date('2026-10-01T00:00:00Z'))).toBe('2026-10');
  });
});

describe('revenueByMonth', () => {
  const buckets = monthBuckets(NOW, 3); // Oct, Sep, Aug
  const inv = (when: string, amountPaid: number, currency = 'eur') => ({ created: unix(when), currency, amountPaid });

  it('adds up what was paid in each month per currency', () => {
    const r = revenueByMonth([inv('2026-10-02T10:00:00Z', 8900), inv('2026-10-20T10:00:00Z', 5900), inv('2026-09-30T23:00:00Z', 8900), inv('2026-10-03T10:00:00Z', 1000, 'usd')], buckets);
    expect(r.get('2026-10')).toEqual([{ currency: 'EUR', amountCents: 14800 }, { currency: 'USD', amountCents: 1000 }]);
    expect(r.get('2026-09')).toEqual([{ currency: 'EUR', amountCents: 8900 }]);
    expect(r.get('2026-08')).toEqual([]);
  });

  it('ignores invoices outside the months asked for and zero-value ones', () => {
    const r = revenueByMonth([inv('2026-07-31T10:00:00Z', 8900), inv('2026-10-05T10:00:00Z', 0)], buckets);
    expect([...r.values()].every((v) => v.length === 0)).toBe(true);
  });
});

describe('weightOutcomes', () => {
  const buckets = monthBuckets(NOW, 2); // Oct, Sep
  const at = (iso: string) => new Date(iso);
  const start = new Map([['a', 100], ['b', 100], ['c', 100]]);

  it('counts each patient once a month, at their last check-in, against their starting weight', () => {
    const r = weightOutcomes(
      [
        { patientId: 'a', weightKg: 97, at: at('2026-10-02T00:00:00Z') },
        { patientId: 'a', weightKg: 93, at: at('2026-10-20T00:00:00Z') }, // the later one counts: 7%
        { patientId: 'b', weightKg: 99, at: at('2026-10-05T00:00:00Z') }, // 1%
      ],
      start,
      buckets,
    );
    expect(r.get('2026-10')).toEqual({ patients: 2, avgLossPct: 4, successRatePct: 50 });
  });

  it('treats exactly the threshold as a success', () => {
    const r = weightOutcomes([{ patientId: 'a', weightKg: 100 - SUCCESS_LOSS_PCT, at: at('2026-10-02T00:00:00Z') }], start, buckets);
    expect(r.get('2026-10')?.successRatePct).toBe(100);
  });

  it('does not hide a patient who gained weight', () => {
    const r = weightOutcomes([{ patientId: 'a', weightKg: 104, at: at('2026-10-02T00:00:00Z') }, { patientId: 'b', weightKg: 94, at: at('2026-10-03T00:00:00Z') }], start, buckets);
    expect(r.get('2026-10')).toEqual({ patients: 2, avgLossPct: 1, successRatePct: 50 });
  });

  it('skips patients with no known starting weight, and has no figures for an empty month', () => {
    const r = weightOutcomes([{ patientId: 'zzz', weightKg: 90, at: at('2026-10-02T00:00:00Z') }], start, buckets);
    expect(r.get('2026-10')).toEqual({ patients: 0, avgLossPct: null, successRatePct: null });
    expect(r.get('2026-09')).toEqual({ patients: 0, avgLossPct: null, successRatePct: null });
  });
});

describe('MonthlyReportService', () => {
  let prisma: any;
  let service: MonthlyReportService;
  const config = { get: jest.fn() }; // no Stripe key

  beforeEach(() => {
    prisma = {
      lead: { findMany: jest.fn().mockResolvedValue([{ createdAt: new Date('2026-10-03') }, { createdAt: new Date('2026-10-09') }, { createdAt: new Date('2026-09-20') }]) },
      patient: { findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve('activatedAt' in where ? [{ activatedAt: new Date('2026-10-04') }] : [{ subscriptionEndedAt: new Date('2026-09-12') }])) },
      order: { findMany: jest.fn().mockResolvedValue([{ dispatchedAt: new Date('2026-10-06') }]) },
      checkIn: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            'reviewedAt' in where
              ? [{ reviewedAt: new Date('2026-10-07'), outcome: 'REPEAT' }, { reviewedAt: new Date('2026-10-08'), outcome: 'NEW_PRESCRIPTION' }, { reviewedAt: new Date('2026-10-09'), outcome: 'HOLD' }, { reviewedAt: new Date('2026-09-09'), outcome: 'STOP' }]
              : [{ patientId: 'a', weightKg: '93.0', completedAt: new Date('2026-10-05') }],
          ),
        ),
      },
      weightGoal: { findMany: jest.fn().mockResolvedValue([{ patientId: 'a', startingWeightKg: '100' }]) },
    };
    service = new MonthlyReportService(config as any, prisma);
  });

  it('counts each month from the records', async () => {
    const report = await service.report(2, NOW);
    expect(report.months.map((m) => m.month)).toEqual(['2026-10', '2026-09']);
    expect(report.months[0]).toMatchObject({ newLeads: 2, newPatients: 1, subscriptionsEnded: 0, ordersDispatched: 1, checkInsReviewed: 3, continued: 2, held: 1, stopped: 0, weighedPatients: 1, avgLossPct: 7, successRatePct: 100 });
    expect(report.months[1]).toMatchObject({ newLeads: 1, newPatients: 0, subscriptionsEnded: 1, checkInsReviewed: 1, stopped: 1, weighedPatients: 0, avgLossPct: null });
  });

  it('says revenue is not available, rather than zero, when Stripe is not set up', async () => {
    const report = await service.report(2, NOW);
    expect(report).toMatchObject({ revenueConfigured: false, revenueError: null, revenueTruncated: false });
    expect(report.months.every((m) => m.revenue.length === 0)).toBe(true);
  });

  it('only reads the months asked for', async () => {
    await service.report(3, NOW);
    expect(prisma.lead.findMany).toHaveBeenCalledWith({ where: { createdAt: { gte: new Date('2026-08-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') } }, select: { createdAt: true } });
  });
});
