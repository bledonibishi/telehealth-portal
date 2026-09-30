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
      where: { patientId: 'p-1', scheduledFor: { gte: expect.any(Date) }, status: { not: 'SCHEDULED' } },
      orderBy: { scheduledFor: 'asc' },
    });
  });

  it('reports zero adherence for an empty window', async () => {
    const prisma = makePrisma();
    const service = new TrendsService(prisma as any);

    const weeks = await service.doseAdherenceTrend('p-1');

    expect(weeks).toEqual([]);
  });
});
