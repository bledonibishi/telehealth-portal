import { TrendsService } from './trends.service';

function makePrisma() {
  return {
    checkIn: { findMany: jest.fn().mockResolvedValue([]) },
    doseEvent: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('TrendsService.checkInAnswerTrend', () => {
  it('extracts a numeric answer from each completed check-in, oldest first', async () => {
    const prisma = makePrisma();
    prisma.checkIn.findMany.mockResolvedValue([
      { id: 'ci-1', completedAt: new Date('2026-08-01'), answers: [{ questionId: 'weight_kg', value: '95.4' }] },
      { id: 'ci-2', completedAt: new Date('2026-09-01'), answers: [{ questionId: 'weight_kg', value: '93.1' }] },
    ]);
    const service = new TrendsService(prisma as any);

    const points = await service.checkInAnswerTrend('p-1', 'weight_kg');

    expect(points).toEqual([
      { checkInId: 'ci-1', date: new Date('2026-08-01'), value: 95.4 },
      { checkInId: 'ci-2', date: new Date('2026-09-01'), value: 93.1 },
    ]);
    expect(prisma.checkIn.findMany).toHaveBeenCalledWith({
      where: { patientId: 'p-1', status: 'COMPLETED', completedAt: { not: null } },
      orderBy: { completedAt: 'asc' },
    });
  });

  it('skips check-ins that never answered that question, or answered non-numerically', async () => {
    const prisma = makePrisma();
    prisma.checkIn.findMany.mockResolvedValue([
      { id: 'ci-1', completedAt: new Date('2026-08-01'), answers: [{ questionId: 'other_question', value: '1' }] },
      { id: 'ci-2', completedAt: new Date('2026-09-01'), answers: [{ questionId: 'weight_kg', value: null }] },
      { id: 'ci-3', completedAt: new Date('2026-10-01'), answers: null },
    ]);
    const service = new TrendsService(prisma as any);

    const points = await service.checkInAnswerTrend('p-1', 'weight_kg');

    expect(points).toEqual([]);
  });
});

describe('TrendsService.doseAdherenceTrend', () => {
  // Wednesday, so "current week" tests exercise a genuinely partial week.
  const NOW = new Date('2026-09-30T12:00:00Z');

  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('buckets resolved doses by the Monday-aligned week they were due and computes adherence', async () => {
    const prisma = makePrisma();
    // Mon 2026-09-07 and Wed 2026-09-09 fall in the same ISO week.
    prisma.doseEvent.findMany.mockResolvedValue([
      { scheduledFor: new Date('2026-09-07T09:00:00Z'), status: 'TAKEN' },
      { scheduledFor: new Date('2026-09-09T09:00:00Z'), status: 'MISSED' },
      { scheduledFor: new Date('2026-09-14T09:00:00Z'), status: 'TAKEN' },
    ]);
    const service = new TrendsService(prisma as any);

    const weeks = await service.doseAdherenceTrend('p-1', 4);

    expect(weeks).toEqual([
      { weekStart: new Date('2026-09-07T00:00:00.000Z'), taken: 1, missed: 1, skipped: 0, adherencePct: 50 },
      { weekStart: new Date('2026-09-14T00:00:00.000Z'), taken: 1, missed: 0, skipped: 0, adherencePct: 100 },
    ]);
  });

  it('ignores doses still scheduled (not yet resolved)', async () => {
    const prisma = makePrisma();
    const service = new TrendsService(prisma as any);

    await service.doseAdherenceTrend('p-1', 4);

    expect(prisma.doseEvent.findMany).toHaveBeenCalledWith({
      where: { patientId: 'p-1', scheduledFor: { gte: expect.any(Date), lte: NOW }, status: { not: 'SCHEDULED' } },
      orderBy: { scheduledFor: 'asc' },
    });
  });

  it('excludes a resolved dose scheduled in the future', async () => {
    const prisma = makePrisma();
    prisma.doseEvent.findMany.mockResolvedValue([
      { scheduledFor: new Date('2026-09-29T09:00:00Z'), status: 'TAKEN' }, // within the current week, in the past
      { scheduledFor: new Date('2026-10-05T09:00:00Z'), status: 'TAKEN' }, // future — should never be fetched
    ]);
    const service = new TrendsService(prisma as any);

    await service.doseAdherenceTrend('p-1', 4);

    const where = prisma.doseEvent.findMany.mock.calls[0][0].where;
    expect(where.scheduledFor.lte).toEqual(NOW);
  });

  it('starts the window at the Monday of the earliest requested week, counting the current week as one of them', async () => {
    const prisma = makePrisma();
    // Only what a correctly-filtered query would actually return: Sept 29 is
    // in the current week (Monday Sept 28); Sept 24 (week of Sept 21) is
    // before the window and would be excluded by the `since` bound below —
    // the old "now - 7 days" cutoff would have wrongly included it.
    prisma.doseEvent.findMany.mockResolvedValue([{ scheduledFor: new Date('2026-09-29T09:00:00Z'), status: 'TAKEN' }]);
    const service = new TrendsService(prisma as any);

    // A midweek 1-week request should return only the current (partial) week.
    const weeks = await service.doseAdherenceTrend('p-1', 1);

    const since = prisma.doseEvent.findMany.mock.calls[0][0].where.scheduledFor.gte;
    expect(since).toEqual(new Date('2026-09-28T00:00:00.000Z'));
    expect(weeks).toEqual([{ weekStart: new Date('2026-09-28T00:00:00.000Z'), taken: 1, missed: 0, skipped: 0, adherencePct: 100 }]);
  });

  it('reports zero adherence for an empty window', async () => {
    const prisma = makePrisma();
    const service = new TrendsService(prisma as any);

    const weeks = await service.doseAdherenceTrend('p-1');

    expect(weeks).toEqual([]);
  });

  it('treats an explicit null the same as omitted — defaults to 12 weeks', async () => {
    const prisma = makePrisma();
    const service = new TrendsService(prisma as any);

    await service.doseAdherenceTrend('p-1', null);

    const since = prisma.doseEvent.findMany.mock.calls[0][0].where.scheduledFor.gte;
    // Monday of the current week, minus 11 more weeks.
    expect(since).toEqual(new Date('2026-07-13T00:00:00.000Z'));
  });

  it.each([0, -1, 1.5, 53])('rejects an invalid weeks value (%s)', async (invalid) => {
    const prisma = makePrisma();
    const service = new TrendsService(prisma as any);

    await expect(service.doseAdherenceTrend('p-1', invalid)).rejects.toThrow(/between/);
    expect(prisma.doseEvent.findMany).not.toHaveBeenCalled();
  });
});
