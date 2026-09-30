import { LabsService } from './labs.service';

function makePrisma() {
  return {
    labResult: {
      create: jest.fn(({ data }) => Promise.resolve({ id: 'lab-1', ...data })),
      update: jest.fn(({ data }) => Promise.resolve({ id: 'lab-1', ...data })),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

describe('LabsService.record', () => {
  it('flags a value below the reference range', async () => {
    const prisma = makePrisma();
    const service = new LabsService(prisma as any);

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
    const service = new LabsService(prisma as any);

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
    const service = new LabsService(prisma as any);

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
    const service = new LabsService(prisma as any);

    const result = await service.record('clin-1', {
      patientId: 'p-1',
      kind: 'OTHER' as any,
      value: 42,
      unit: 'units',
      collectedAt: new Date('2026-09-01'),
    });

    expect(result.flagged).toBe(false);
  });
});

describe('LabsService.review', () => {
  it('records who reviewed it and when', async () => {
    const prisma = makePrisma();
    prisma.labResult.findUnique.mockResolvedValue({ id: 'lab-1', flagged: true, reviewedAt: null });
    const service = new LabsService(prisma as any);

    await service.review('clin-2', { labResultId: 'lab-1', reviewNote: 'Dose held pending recheck' });

    expect(prisma.labResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lab-1' },
        data: expect.objectContaining({ reviewedById: 'clin-2', reviewNote: 'Dose held pending recheck', reviewedAt: expect.any(Date) }),
      }),
    );
  });

  it('refuses to review a lab result that does not exist', async () => {
    const prisma = makePrisma();
    prisma.labResult.findUnique.mockResolvedValue(null);
    const service = new LabsService(prisma as any);

    await expect(service.review('clin-2', { labResultId: 'missing' })).rejects.toThrow(/not found/);
    expect(prisma.labResult.update).not.toHaveBeenCalled();
  });
});
