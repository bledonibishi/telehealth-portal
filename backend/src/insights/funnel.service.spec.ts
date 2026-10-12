import { FunnelService, toStages } from './funnel.service';

describe('toStages', () => {
  it('works out each stage against the one before it and against the start', () => {
    const stages = toStages({ PASSED_ELIGIBILITY: 200, PAID: 50, ACCOUNT_ACTIVATED: 40, CONSULTATION_SUBMITTED: 36, DOCTOR_APPROVED: 30, FIRST_SHIPMENT: 24 });
    expect(stages[0]).toEqual({ key: 'PASSED_ELIGIBILITY', count: 200, percentOfPrevious: null, percentOfFirst: null });
    expect(stages[1]).toMatchObject({ key: 'PAID', percentOfPrevious: 25, percentOfFirst: 25 });
    expect(stages[4]).toMatchObject({ key: 'DOCTOR_APPROVED', percentOfPrevious: 83.3, percentOfFirst: 15 });
    expect(stages[5]).toMatchObject({ percentOfPrevious: 80, percentOfFirst: 12 });
  });

  it('starts at the landing page when the website stages are there', () => {
    const stages = toStages({ LANDING_VISITORS: 1000, QUIZ_STARTED: 400, PASSED_ELIGIBILITY: 200, PAID: 50 });
    expect(stages.map((s) => s.key)).toEqual(['LANDING_VISITORS', 'QUIZ_STARTED', 'PASSED_ELIGIBILITY', 'PAID']);
    expect(stages[1]).toMatchObject({ percentOfPrevious: 40, percentOfFirst: 40 });
    expect(stages[2]).toMatchObject({ percentOfPrevious: 50, percentOfFirst: 20 });
    expect(stages[3]).toMatchObject({ percentOfPrevious: 25, percentOfFirst: 5 });
  });

  it('gives null percentages rather than dividing by zero', () => {
    const stages = toStages({ PASSED_ELIGIBILITY: 0, PAID: 0, ACCOUNT_ACTIVATED: 0, CONSULTATION_SUBMITTED: 0, DOCTOR_APPROVED: 0, FIRST_SHIPMENT: 0 });
    expect(stages.every((s) => s.percentOfPrevious === null && s.percentOfFirst === null)).toBe(true);
  });
});

// A lead's answers as the website sends them: option labels.
const lead = (id: string, age: string) => ({ id, productKind: 'HRT', quizAnswers: [{ questionId: 'age', question: 'Age?', answer: age }] });
const OK = '40 to 54';
const UNDER_18 = 'Under 18'; // a critical flag: RED

function build(leads: any[], top: any = { configured: false, data: null, error: null }) {
  const count = jest.fn().mockResolvedValue(1);
  const prisma = { lead: { count, findMany: jest.fn().mockResolvedValue(leads) } };
  const visitors = { topOfFunnel: jest.fn().mockResolvedValue(top) };
  return { service: new FunnelService(prisma as any, visitors as any), count, prisma, visitors };
}

describe('FunnelService.funnel', () => {
  const now = new Date('2026-10-15T00:00:00Z');

  it('counts only leads from the period, and each stage also requires the ones before it', async () => {
    const { service, count, prisma } = build([lead('a', OK)]);
    const result = await service.funnel(30, now);

    expect(prisma.lead.findMany.mock.calls[0][0].where.createdAt.gte).toEqual(new Date('2026-09-15T00:00:00Z'));
    expect(count).toHaveBeenCalledTimes(5);
    for (const [{ where }] of count.mock.calls) expect(where.createdAt.gte).toEqual(new Date('2026-09-15T00:00:00Z'));
    const [paid, activated, submitted, approved, shipped] = count.mock.calls.map(([a]) => a.where);

    expect(paid.convertedAt).toEqual({ not: null });
    expect(activated).toMatchObject({ convertedAt: { not: null }, patient: { activatedAt: { not: null } } });
    expect(submitted.patient).toMatchObject({ activatedAt: { not: null }, consultations: { some: {} } });
    expect(approved.patient.consultations).toEqual({ some: { status: 'APPROVED' } });
    expect(shipped.patient).toMatchObject({ consultations: { some: { status: 'APPROVED' } }, orders: { some: { status: { in: ['DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED'] } } } });
    expect(result.stages.map((s) => s.key)).toEqual(['PASSED_ELIGIBILITY', 'PAID', 'ACCOUNT_ACTIVATED', 'CONSULTATION_SUBMITTED', 'DOCTOR_APPROVED', 'FIRST_SHIPMENT']);
    expect(result.visitorsConfigured).toBe(false);
  });

  it('does not count leads the triage marked RED as having passed eligibility, nor at any later stage', async () => {
    const { service, count } = build([lead('ok-1', OK), lead('ok-2', OK), lead('red-1', UNDER_18)]);
    const result = await service.funnel(30, now);

    expect(result.stages[0]).toMatchObject({ key: 'PASSED_ELIGIBILITY', count: 2 });
    for (const [{ where }] of count.mock.calls) expect(where.id).toEqual({ notIn: ['red-1'] });
  });

  it('adds the landing page and quiz-start stages from PostHog', async () => {
    const { service, visitors } = build([lead('a', OK), lead('b', OK)], { configured: true, data: { visitors: 100, quizStarted: 20 }, error: null });
    const result = await service.funnel(30, now);

    expect(visitors.topOfFunnel).toHaveBeenCalledWith(30, now.getTime());
    expect(result.stages.slice(0, 3)).toEqual([
      { key: 'LANDING_VISITORS', count: 100, percentOfPrevious: null, percentOfFirst: null },
      { key: 'QUIZ_STARTED', count: 20, percentOfPrevious: 20, percentOfFirst: 20 },
      { key: 'PASSED_ELIGIBILITY', count: 2, percentOfPrevious: 10, percentOfFirst: 2 },
    ]);
    expect(result.visitorsConfigured).toBe(true);
  });

  it('never shows fewer quiz starts than leads who finished it (a blocked tracker must not break the funnel)', async () => {
    const leads = ['a', 'b', 'c', 'd', 'e'].map((id) => lead(id, OK));
    const { service } = build(leads, { configured: true, data: { visitors: 3, quizStarted: 2 }, error: null });
    const result = await service.funnel(30, now);
    expect(result.stages.slice(0, 3).map((s) => s.count)).toEqual([5, 5, 5]);
    expect(result.stages.every((s) => s.percentOfPrevious === null || s.percentOfPrevious <= 100)).toBe(true);
  });

  it('leaves the website stages out and says why when PostHog fails', async () => {
    const { service } = build([lead('a', OK)], { configured: true, data: null, error: 'PostHog answered 401' });
    const result = await service.funnel(30, now);
    expect(result.stages[0].key).toBe('PASSED_ELIGIBILITY');
    expect(result).toMatchObject({ visitorsConfigured: true, visitorsError: 'PostHog answered 401' });
  });
});
