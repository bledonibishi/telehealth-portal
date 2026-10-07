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

describe('CheckInsService.submit — what the patient writes in their notes', () => {
  const submitWith = async (notes?: string) => {
    const prisma = makePrisma(makeGlp1Prescription({ titrationStep: 2, issuedDaysAgo: 60, previousStep: 2 }));
    const service = new CheckInsService(prisma as any, {} as any, { get: jest.fn() } as any);
    await service.submit('tok-1', {
      answers: glp1Answers({ side_effect_impact: 'mild', ...(notes !== undefined && { notes }) }),
      wantsToReorder: false,
      feeling: 'OKAY' as any,
    });
    return flagsOf(prisma);
  };

  it('flags anxiety in the note for the doctor, quoting the words', async () => {
    expect(await submitWith('I have been very anxious this month')).toContainEqual(
      expect.objectContaining({ severity: 'WARNING', description: expect.stringContaining('anxiety') }),
    );
  });

  it('flags wanting to stop, and trouble with the dose', async () => {
    const flags = await submitWith('The dose is too strong and I want to stop');
    expect(flags.map((f) => f.description).join(' | ')).toMatch(/low motivation or wanting to stop.*difficulty with the dose|difficulty with the dose.*low motivation/);
  });

  it('marks language about self-harm CRITICAL, so it goes to the top of the review queue', async () => {
    expect(await submitWith('Sometimes I think about suicide')).toContainEqual(expect.objectContaining({ severity: 'CRITICAL' }));
  });

  it('adds nothing for an ordinary note or none at all', async () => {
    expect(await submitWith('All good, thanks')).toEqual([]);
    expect(await submitWith()).toEqual([]);
  });
});

describe('CheckInsService — scheduling and rescheduling', () => {
  const build = (env: string, prisma: any) => new CheckInsService(prisma, {} as any, { get: (k: string) => (k === 'NODE_ENV' ? env : undefined) } as any);

  it('schedules the first check-in 30 days after the first order was dispatched', async () => {
    const dispatchedAt = new Date('2026-10-01T10:00:00Z');
    const prisma = {
      patient: { findMany: jest.fn().mockResolvedValue([{ id: 'p-1', email: 'p@example.com', checkIns: [], orders: [{ dispatchedAt }] }]) },
      checkIn: { create: jest.fn() },
    };
    await build('development', prisma).ensureScheduled();
    expect(prisma.checkIn.create).toHaveBeenCalledWith({ data: { patientId: 'p-1', dueAt: new Date(dispatchedAt.getTime() + 30 * DAY) } });
  });

  it('schedules nothing until an order has been dispatched', async () => {
    const prisma = {
      patient: { findMany: jest.fn().mockResolvedValue([{ id: 'p-1', email: 'p@example.com', checkIns: [], orders: [] }]) },
      checkIn: { create: jest.fn() },
    };
    await build('development', prisma).ensureScheduled();
    expect(prisma.checkIn.create).not.toHaveBeenCalled();
  });

  it('reschedules a sent check-in back to scheduled in development', async () => {
    const prisma = { checkIn: { findUnique: jest.fn().mockResolvedValue({ id: 'ci-1', status: 'SENT' }), update: jest.fn().mockResolvedValue({ id: 'ci-1' }) } };
    const dueAt = new Date('2026-10-08T00:00:00Z');
    await build('development', prisma).reschedule('ci-1', dueAt);
    expect(prisma.checkIn.update).toHaveBeenCalledWith({
      where: { id: 'ci-1' },
      data: { dueAt, status: 'SCHEDULED', token: null, tokenExpiresAt: null, sentAt: null },
    });
  });

  it('refuses to reschedule in production', async () => {
    const prisma = { checkIn: { findUnique: jest.fn(), update: jest.fn() } };
    await expect(build('production', prisma).reschedule('ci-1', new Date())).rejects.toThrow(/development/);
    expect(prisma.checkIn.update).not.toHaveBeenCalled();
  });
});
