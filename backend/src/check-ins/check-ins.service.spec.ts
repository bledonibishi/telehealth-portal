import { CheckInsService } from './check-ins.service';

const DAY = 86_400_000;

const PATIENT = { id: 'p-1', email: 'p@example.com', firstName: 'Tia', lead: null };
const CHECK_IN = { id: 'ci-1', patientId: 'p-1', token: 'tok-1', status: 'SENT', tokenExpiresAt: new Date(Date.now() + DAY), patient: PATIENT };

const glp1Answers = (over: Record<string, string> = {}) =>
  Object.entries({
    weight_kg: '95',
    doses_missed: '0',
    side_effects: 'nausea',
    side_effect_impact: 'severe',
    abdominal_pain: 'no',
    gallbladder_symptoms: 'no',
    pregnancy: 'no',
    new_medicines: 'no',
    ...over,
  }).map(([questionId, v]) => ({ questionId, answer: v, value: v }));

function makePrisma(prescription: any) {
  return {
    checkIn: {
      findUnique: jest.fn().mockResolvedValue(CHECK_IN),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...CHECK_IN, status: 'COMPLETED' }),
    },
    prescription: { findFirst: jest.fn().mockResolvedValue(prescription) },
    patient: { findUnique: jest.fn().mockResolvedValue(PATIENT) },
    // No dose log, so the missed-dose flag (check-ins.missed-doses.spec.ts) stays out of these.
    doseEvent: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function makeGlp1Prescription(
  over: { titrationStep?: number | null; weeksPerStep?: number | null; issuedDaysAgo?: number; previousStep?: number | null } = {},
) {
  const { titrationStep = 3, weeksPerStep = 4, issuedDaysAgo = 5, previousStep = titrationStep !== null ? titrationStep - 1 : null } = over;
  return {
    id: 'rx-1',
    issuedAt: new Date(Date.now() - issuedDaysAgo * DAY),
    items: [{ product: { kind: 'GLP1', category: 'GLP1', weeksPerStep }, strength: { titrationStep } }],
    supersedes:
      previousStep === null
        ? null
        : { items: [{ product: { category: 'GLP1' }, strength: { titrationStep: previousStep } }] },
  };
}

function flagsOf(prisma: ReturnType<typeof makePrisma>): any[] {
  return prisma.checkIn.updateMany.mock.calls[0][0].data.redFlags;
}

describe('CheckInsService.submit — GLP-1 titration/side-effect correlation', () => {
  it('flags severe side effects reported within the step interval of a titration step-up', async () => {
    const prisma = makePrisma(makeGlp1Prescription({ titrationStep: 3, weeksPerStep: 4, issuedDaysAgo: 5 }));
    const service = new CheckInsService(prisma as any, {} as any, { get: jest.fn() } as any);

    await service.submit('tok-1', { answers: glp1Answers(), wantsToReorder: false, feeling: 'OKAY' as any });

    expect(flagsOf(prisma)).toContainEqual(
      expect.objectContaining({ severity: 'WARNING', description: expect.stringContaining('titration step 3') }),
    );
  });

  it('does not flag mild side effects, even shortly after a step-up', async () => {
    const prisma = makePrisma(makeGlp1Prescription({ titrationStep: 3, weeksPerStep: 4, issuedDaysAgo: 5 }));
    const service = new CheckInsService(prisma as any, {} as any, { get: jest.fn() } as any);

    await service.submit('tok-1', { answers: glp1Answers({ side_effect_impact: 'mild' }), wantsToReorder: false, feeling: 'OKAY' as any });

    expect(flagsOf(prisma)).toEqual([]);
  });

  it('does not add the titration flag once well past the step-up window', async () => {
    const prisma = makePrisma(makeGlp1Prescription({ titrationStep: 3, weeksPerStep: 4, issuedDaysAgo: 60 }));
    const service = new CheckInsService(prisma as any, {} as any, { get: jest.fn() } as any);

    await service.submit('tok-1', { answers: glp1Answers(), wantsToReorder: false, feeling: 'OKAY' as any });

    // The questionnaire's own baseline "severe side effects" flag still fires —
    // only the titration-specific correlation should be suppressed here.
    expect(flagsOf(prisma)).not.toContainEqual(expect.objectContaining({ description: expect.stringContaining('titration step') }));
  });

  it('does not add the titration flag for a patient on their first-ever prescription (nothing to compare against)', async () => {
    const prisma = makePrisma(makeGlp1Prescription({ titrationStep: 1, weeksPerStep: 4, issuedDaysAgo: 2, previousStep: null }));
    const service = new CheckInsService(prisma as any, {} as any, { get: jest.fn() } as any);

    await service.submit('tok-1', { answers: glp1Answers(), wantsToReorder: false, feeling: 'OKAY' as any });

    expect(flagsOf(prisma)).not.toContainEqual(expect.objectContaining({ description: expect.stringContaining('titration step') }));
  });

  it('does not add the titration flag for a product with no titration schedule', async () => {
    const prisma = makePrisma(makeGlp1Prescription({ titrationStep: null, weeksPerStep: null, issuedDaysAgo: 2 }));
    const service = new CheckInsService(prisma as any, {} as any, { get: jest.fn() } as any);

    await service.submit('tok-1', { answers: glp1Answers(), wantsToReorder: false, feeling: 'OKAY' as any });

    expect(flagsOf(prisma)).not.toContainEqual(expect.objectContaining({ description: expect.stringContaining('titration step') }));
  });

  it('does not add the titration flag for a same-strength reissue (e.g. a REPEAT outcome), even with severe side effects', async () => {
    // The new prescription keeps the patient at their existing step 3 — not an increase.
    const prisma = makePrisma(makeGlp1Prescription({ titrationStep: 3, weeksPerStep: 4, issuedDaysAgo: 2, previousStep: 3 }));
    const service = new CheckInsService(prisma as any, {} as any, { get: jest.fn() } as any);

    await service.submit('tok-1', { answers: glp1Answers(), wantsToReorder: false, feeling: 'OKAY' as any });

    expect(flagsOf(prisma)).not.toContainEqual(expect.objectContaining({ description: expect.stringContaining('titration step') }));
  });

  it('does not add the titration flag for a first-ever prescription started above the lowest dose (verified prior use, not a step-up here)', async () => {
    const prisma = makePrisma(makeGlp1Prescription({ titrationStep: 3, weeksPerStep: 4, issuedDaysAgo: 2, previousStep: null }));
    const service = new CheckInsService(prisma as any, {} as any, { get: jest.fn() } as any);

    await service.submit('tok-1', { answers: glp1Answers(), wantsToReorder: false, feeling: 'OKAY' as any });

    expect(flagsOf(prisma)).not.toContainEqual(expect.objectContaining({ description: expect.stringContaining('titration step') }));
  });
});
