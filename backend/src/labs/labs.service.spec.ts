import { LabsService } from './labs.service';

function makePrisma() {
  return {
    labResult: {
      create: jest.fn(({ data }) => Promise.resolve({ id: 'lab-1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve({ id: where.id, reviewedAt: new Date() })),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('LabsService.record', () => {
  it('flags a value below the reference range', async () => {
    const prisma = makePrisma();
    const service = new LabsService(prisma as any, makeAudit() as any);

    const result = await service.record('clin-1', {
      patientId: 'p-1',
      kind: 'TESTOSTERONE' as any,
      value: 150,
      unit: 'ng/dL',
      referenceRangeLow: 300,
      referenceRangeHigh: 1000,
      collectedAt: new Date('2026-09-01'),
    });

    expect(result.flagged).toBe(true);
    expect(prisma.labResult.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ flagged: true, enteredById: 'clin-1' }) }),
    );
  });

  it('flags a value above the reference range', async () => {
    const prisma = makePrisma();
    const service = new LabsService(prisma as any, makeAudit() as any);

    const result = await service.record('clin-1', {
      patientId: 'p-1',
      kind: 'PSA' as any,
      value: 6.2,
      unit: 'ng/mL',
      referenceRangeLow: 0,
      referenceRangeHigh: 4,
      collectedAt: new Date('2026-09-01'),
    });

    expect(result.flagged).toBe(true);
  });

  it('does not flag a value within range', async () => {
    const prisma = makePrisma();
    const service = new LabsService(prisma as any, makeAudit() as any);

    const result = await service.record('clin-1', {
      patientId: 'p-1',
      kind: 'ESTRADIOL' as any,
      value: 80,
      unit: 'pg/mL',
      referenceRangeLow: 30,
      referenceRangeHigh: 120,
      collectedAt: new Date('2026-09-01'),
    });

    expect(result.flagged).toBe(false);
  });

  it('does not flag when no reference range is given', async () => {
    const prisma = makePrisma();
    const service = new LabsService(prisma as any, makeAudit() as any);

    const result = await service.record('clin-1', {
      patientId: 'p-1',
      kind: 'OTHER' as any,
      analyteName: 'Free T3',
      value: 42,
      unit: 'units',
      collectedAt: new Date('2026-09-01'),
    });

    expect(result.flagged).toBe(false);
  });

  it('requires an analyte name when kind is OTHER', async () => {
    const prisma = makePrisma();
    const service = new LabsService(prisma as any, makeAudit() as any);

    await expect(
      service.record('clin-1', { patientId: 'p-1', kind: 'OTHER' as any, value: 1, unit: 'units', collectedAt: new Date('2026-09-01') }),
    ).rejects.toThrow(/analyteName/);
    expect(prisma.labResult.create).not.toHaveBeenCalled();
  });

  it('rejects an inverted reference range', async () => {
    const prisma = makePrisma();
    const service = new LabsService(prisma as any, makeAudit() as any);

    await expect(
      service.record('clin-1', {
        patientId: 'p-1',
        kind: 'TESTOSTERONE' as any,
        value: 500,
        unit: 'ng/dL',
        referenceRangeLow: 1000,
        referenceRangeHigh: 300,
        collectedAt: new Date('2026-09-01'),
      }),
    ).rejects.toThrow(/referenceRangeLow/);
    expect(prisma.labResult.create).not.toHaveBeenCalled();
  });

  it('writes an audit log entry on success', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const service = new LabsService(prisma as any, audit as any);

    await service.record('clin-1', {
      patientId: 'p-1',
      kind: 'TESTOSTERONE' as any,
      value: 500,
      unit: 'ng/dL',
      collectedAt: new Date('2026-09-01'),
    });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'clin-1', action: 'LAB_RESULT_RECORDED', resourceType: 'LabResult', resourceId: 'lab-1' }),
    );
  });
});

describe('LabsService.review', () => {
  it('records who reviewed it and when, only if not already reviewed', async () => {
    const prisma = makePrisma();
    const service = new LabsService(prisma as any, makeAudit() as any);

    await service.review('clin-2', { labResultId: 'lab-1', reviewNote: 'Dose held pending recheck' });

    expect(prisma.labResult.updateMany).toHaveBeenCalledWith({
      where: { id: 'lab-1', reviewedAt: null },
      data: { reviewedAt: expect.any(Date), reviewedById: 'clin-2', reviewNote: 'Dose held pending recheck' },
    });
  });

  it('writes an audit log entry on success', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const service = new LabsService(prisma as any, audit as any);

    await service.review('clin-2', { labResultId: 'lab-1' });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'clin-2', action: 'LAB_RESULT_REVIEWED', resourceType: 'LabResult', resourceId: 'lab-1' }),
    );
  });

  it('refuses to review a lab result that does not exist', async () => {
    const prisma = makePrisma();
    prisma.labResult.updateMany.mockResolvedValue({ count: 0 });
    prisma.labResult.findUnique.mockResolvedValue(null);
    const service = new LabsService(prisma as any, makeAudit() as any);

    await expect(service.review('clin-2', { labResultId: 'missing' })).rejects.toThrow(/not found/);
  });

  it('rejects a second review of an already-reviewed result as a conflict, without overwriting it', async () => {
    const prisma = makePrisma();
    prisma.labResult.updateMany.mockResolvedValue({ count: 0 });
    prisma.labResult.findUnique.mockResolvedValue({ id: 'lab-1', reviewedAt: new Date(), reviewedById: 'clin-1' });
    const audit = makeAudit();
    const service = new LabsService(prisma as any, audit as any);

    await expect(service.review('clin-2', { labResultId: 'lab-1', reviewNote: 'overwrite attempt' })).rejects.toThrow(/already been reviewed/);
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('LabsService list methods', () => {
  it("never attaches clinician detail to a patient's own view", () => {
    const prisma = makePrisma();
    const service = new LabsService(prisma as any, makeAudit() as any);

    service.listForPatientSelf('p-1');

    expect(prisma.labResult.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ include: expect.anything() }),
    );
  });

  it("includes who entered and reviewed each result in the staff view", () => {
    const prisma = makePrisma();
    const service = new LabsService(prisma as any, makeAudit() as any);

    service.listForPatient('p-1');

    expect(prisma.labResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { enteredBy: true, reviewedBy: true } }),
    );
  });
});
