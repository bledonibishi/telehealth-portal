import { FunnelService, toStages } from './funnel.service';

describe('toStages', () => {
  it('works out each stage against the one before it and against the start', () => {
    const stages = toStages({ QUIZ_COMPLETED: 200, PAID: 50, ACCOUNT_ACTIVATED: 40, CONSULTATION_SUBMITTED: 36, DOCTOR_APPROVED: 30, FIRST_SHIPMENT: 24 });
    expect(stages[0]).toEqual({ key: 'QUIZ_COMPLETED', count: 200, percentOfPrevious: null, percentOfFirst: null });
    expect(stages[1]).toMatchObject({ key: 'PAID', percentOfPrevious: 25, percentOfFirst: 25 });
    expect(stages[4]).toMatchObject({ key: 'DOCTOR_APPROVED', percentOfPrevious: 83.3, percentOfFirst: 15 });
    expect(stages[5]).toMatchObject({ percentOfPrevious: 80, percentOfFirst: 12 });
  });

  it('gives null percentages rather than dividing by zero', () => {
    const stages = toStages({ QUIZ_COMPLETED: 0, PAID: 0, ACCOUNT_ACTIVATED: 0, CONSULTATION_SUBMITTED: 0, DOCTOR_APPROVED: 0, FIRST_SHIPMENT: 0 });
    expect(stages.every((s) => s.percentOfPrevious === null && s.percentOfFirst === null)).toBe(true);
  });
});

describe('FunnelService.funnel', () => {
  it('counts only leads from the period, and each stage also requires the ones before it', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const now = new Date('2026-10-15T00:00:00Z');
    const result = await new FunnelService({ lead: { count } } as any).funnel(30, now);

    expect(count).toHaveBeenCalledTimes(6);
    for (const [{ where }] of count.mock.calls) expect(where.createdAt.gte).toEqual(new Date('2026-09-15T00:00:00Z'));
    const [quiz, paid, activated, submitted, approved, shipped] = count.mock.calls.map(([a]) => a.where);

    expect(quiz.convertedAt).toBeUndefined();
    expect(paid.convertedAt).toEqual({ not: null });
    expect(activated).toMatchObject({ convertedAt: { not: null }, patient: { activatedAt: { not: null } } });
    expect(submitted.patient).toMatchObject({ activatedAt: { not: null }, consultations: { some: {} } });
    expect(approved.patient.consultations).toEqual({ some: { status: 'APPROVED' } });
    expect(shipped.patient).toMatchObject({ consultations: { some: { status: 'APPROVED' } }, orders: { some: { status: { in: ['DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED'] } } } });
    expect(result.stages.map((s) => s.key)).toEqual(['QUIZ_COMPLETED', 'PAID', 'ACCOUNT_ACTIVATED', 'CONSULTATION_SUBMITTED', 'DOCTOR_APPROVED', 'FIRST_SHIPMENT']);
  });
});
