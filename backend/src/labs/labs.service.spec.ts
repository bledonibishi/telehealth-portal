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
      expect.objectContaining({ include: { enteredBy: true, reviewedBy: true, report: true } }),
    );
  });
});

describe('LabsService lab reports', () => {
  const row = (over: object = {}) => ({ kind: 'ESTRADIOL' as any, value: 340, unit: 'pmol/L', referenceRangeLow: 100, referenceRangeHigh: 700, collectedAt: new Date('2026-09-01'), ...over });

  function make(report: any = { id: 'r-1', patientId: 'p-1', status: 'PENDING' }) {
    const tx: any = {
      labReport: { findUnique: jest.fn().mockResolvedValue(report), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      labResult: { create: jest.fn(({ data }) => Promise.resolve({ id: `lab-${data.value}`, ...data })) },
    };
    const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)), labReport: tx.labReport, labResult: tx.labResult, patient: { findUnique: jest.fn() } };
    const audit = makeAudit();
    return { tx, prisma, audit, service: new LabsService(prisma, audit as any) };
  }

  it('saves the results together, points each at the report, and marks the report entered', async () => {
    const { tx, service } = make();
    const saved = await service.recordMany('doc-1', { patientId: 'p-1', reportId: 'r-1', results: [row(), row({ kind: 'FSH', value: 44, unit: 'IU/L' })] });
    expect(saved).toHaveLength(2);
    expect(tx.labResult.create.mock.calls.every(([a]: any) => a.data.reportId === 'r-1' && a.data.enteredById === 'doc-1')).toBe(true);
    expect(tx.labReport.updateMany).toHaveBeenCalledWith({ where: { id: 'r-1', status: 'PENDING' }, data: expect.objectContaining({ status: 'ENTERED', handledById: 'doc-1' }) });
  });

  it('claims the report before writing anything, and turns away a second save of the same report', async () => {
    const { tx, service } = make();
    tx.labReport.updateMany.mockResolvedValue({ count: 0 }); // somebody else entered it first, or this is a retry
    await expect(service.recordMany('doc-1', { patientId: 'p-1', reportId: 'r-1', results: [row()] })).rejects.toThrow(/already been entered/);
    expect(tx.labResult.create).not.toHaveBeenCalled();

    const ok = make();
    await ok.service.recordMany('doc-1', { patientId: 'p-1', reportId: 'r-1', results: [row()] });
    expect(ok.tx.labReport.updateMany.mock.invocationCallOrder[0]).toBeLessThan(ok.tx.labResult.create.mock.invocationCallOrder[0]);
  });

  it('flags each saved result against its own range', async () => {
    const { tx, service } = make();
    await service.recordMany('doc-1', { patientId: 'p-1', reportId: 'r-1', results: [row({ value: 780 }), row({ value: 300 })] });
    expect(tx.labResult.create.mock.calls.map(([a]: any) => a.data.flagged)).toEqual([true, false]);
  });

  it('refuses a report that belongs to someone else, or one that was rejected, and saves nothing', async () => {
    const other = make({ id: 'r-1', patientId: 'p-2', status: 'PENDING' });
    await expect(other.service.recordMany('doc-1', { patientId: 'p-1', reportId: 'r-1', results: [row()] })).rejects.toThrow(/different patient/);
    expect(other.tx.labResult.create).not.toHaveBeenCalled();

    const rejected = make({ id: 'r-1', patientId: 'p-1', status: 'REJECTED' });
    await expect(rejected.service.recordMany('doc-1', { patientId: 'p-1', reportId: 'r-1', results: [row()] })).rejects.toThrow(/rejected/);
  });

  it('checks every row before saving any', async () => {
    const { prisma, service } = make();
    await expect(service.recordMany('doc-1', { patientId: 'p-1', results: [row(), row({ unit: ' ' })] })).rejects.toThrow(/unit/);
    await expect(service.recordMany('doc-1', { patientId: 'p-1', results: [row({ kind: 'OTHER' })] })).rejects.toThrow(/analyteName/);
    await expect(service.recordMany('doc-1', { patientId: 'p-1', results: [] })).rejects.toThrow(/no results/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('record() with a report goes through the same checks and linking', async () => {
    const { tx, service } = make();
    await service.record('doc-1', { patientId: 'p-1', reportId: 'r-1', kind: 'FSH' as any, value: 44, unit: 'IU/L', collectedAt: new Date('2026-09-01') });
    expect(tx.labResult.create.mock.calls[0][0].data.reportId).toBe('r-1');
  });

  it('lets a patient send in their own uploaded report once, and only their own', async () => {
    const created = { id: 'r-9', patientId: 'p-1', fileId: 'f-1', source: 'PATIENT', status: 'PENDING', note: null, handledAt: null, createdAt: new Date(), file: { filename: 'blood.pdf', mimeType: 'application/pdf' }, _count: { results: 0 } };
    const prisma: any = { labReport: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) } };
    const uploads: any = { findOwned: jest.fn().mockResolvedValue({ id: 'f-1' }) };
    const audit = makeAudit();
    const service = new LabsService(prisma, audit as any, uploads);

    const view = await service.submitOwnReport('p-1', { fileId: 'f-1', note: ' fasting ' });
    expect(uploads.findOwned).toHaveBeenCalledWith('p-1', 'f-1', ['LAB_REPORT']);
    expect(prisma.labReport.create.mock.calls[0][0].data).toMatchObject({ patientId: 'p-1', source: 'PATIENT', note: 'fasting' });
    expect(view).toMatchObject({ status: 'PENDING', fileUrl: '/uploads/f-1/file', resultCount: 0 });

    prisma.labReport.findUnique.mockResolvedValue({ id: 'r-9' });
    await expect(service.submitOwnReport('p-1', { fileId: 'f-1' })).rejects.toThrow(/already sent/);
  });

  it('shows the patient their own note and a rejection reason, but not a doctor’s internal note', async () => {
    const base = { patientId: 'p-1', fileId: 'f', handledAt: null, createdAt: new Date(), file: { filename: 'a.pdf', mimeType: 'application/pdf' }, _count: { results: 0 } };
    const prisma: any = {
      labReport: {
        findMany: jest.fn().mockResolvedValue([
          { ...base, id: '1', source: 'PATIENT', status: 'PENDING', note: 'fasting' },
          { ...base, id: '2', source: 'STAFF', status: 'ENTERED', note: 'internal: check with Dr X' },
          { ...base, id: '3', source: 'PATIENT', status: 'REJECTED', note: 'Too blurry' },
          { ...base, id: '4', source: 'STAFF', status: 'REJECTED', note: 'Wrong patient' },
        ]),
      },
    };
    const views = await new LabsService(prisma, makeAudit() as any).listOwnReports('p-1');
    expect(views.map((v) => v.note)).toEqual(['fasting', undefined, 'Too blurry', 'Wrong patient']);
  });

  it('rejecting a report records why, once', async () => {
    const report = { id: 'r-1', patientId: 'p-1', fileId: 'f-1', source: 'PATIENT', status: 'REJECTED', note: 'Too blurry', handledAt: new Date(), createdAt: new Date(), file: { filename: 'a.jpg', mimeType: 'image/jpeg' }, _count: { results: 0 } };
    const prisma: any = { labReport: { updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }), findUnique: jest.fn().mockResolvedValue(report) } };
    const service = new LabsService(prisma, makeAudit() as any);
    await service.rejectReport('doc-1', { reportId: 'r-1', reason: ' Too blurry ' });
    expect(prisma.labReport.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'REJECTED', note: 'Too blurry' });
    await expect(service.rejectReport('doc-1', { reportId: 'r-1' })).rejects.toThrow(/already been handled/);
  });
});

describe('LabsService.readReport', () => {
  const report = { id: 'r-1', patientId: 'p-1', file: { mimeType: 'application/pdf', storageKey: 'k' }, patient: { firstName: 'Alma', lastName: 'Krasniqi' } };
  const reading = (over: object = {}) => ({ readable: true, patientName: 'Alma Krasniqi', labName: 'Lab', reportDate: '2026-10-01', notes: '', results: [{ kind: 'ESTRADIOL', analyteName: null, value: 340, unit: 'pmol/L', referenceLow: 100, referenceHigh: 700, collectedOn: '2026-09-30', flaggedByLab: false }], ...over });
  function make(outcome: any, existing: any[] = []) {
    const prisma: any = { labReport: { findUnique: jest.fn().mockResolvedValue(report) }, labResult: { findMany: jest.fn().mockResolvedValue(existing) } };
    const reader: any = { read: jest.fn().mockResolvedValue(outcome) };
    const uploads: any = { readContents: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
    const audit = makeAudit();
    return { audit, reader, service: new LabsService(prisma, audit as any, uploads, reader) };
  }

  it('lists the rows for checking and saves nothing', async () => {
    const { service, audit, reader } = make({ status: 'COMPLETED', reading: reading() });
    const out: any = await service.readReport('doc-1', 'r-1');
    expect(reader.read).toHaveBeenCalledWith(Buffer.from('pdf'), 'application/pdf', 'p-1');
    expect(out).toMatchObject({ status: 'COMPLETED', nameMatches: true, results: [{ kind: 'ESTRADIOL', value: 340, alreadyRecorded: false }] });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LAB_REPORT_AI_READ', patientId: 'p-1' }));
  });

  it('warns loudly when the name on the report is not the patient’s', async () => {
    const { service } = make({ status: 'COMPLETED', reading: reading({ patientName: 'Dren Berisha' }) });
    const out: any = await service.readReport('doc-1', 'r-1');
    expect(out.nameMatches).toBe(false);
    expect(out.warnings.join(' ')).toMatch(/not this patient/);
  });

  it('marks a result that is already on the record, and one with no date', async () => {
    const { service } = make(
      { status: 'COMPLETED', reading: reading({ results: [{ kind: 'ESTRADIOL', analyteName: null, value: 340, unit: 'pmol/L', referenceLow: null, referenceHigh: null, collectedOn: '2026-09-30', flaggedByLab: null }, { kind: 'FSH', analyteName: null, value: 44, unit: 'IU/L', referenceLow: null, referenceHigh: null, collectedOn: null, flaggedByLab: null }] }) },
      [{ kind: 'ESTRADIOL', analyteName: null, value: 340, collectedAt: new Date('2026-09-30T09:00:00Z') }],
    );
    const out: any = await service.readReport('doc-1', 'r-1');
    expect(out.results.map((r: any) => r.alreadyRecorded)).toEqual([true, false]);
    expect(out.warnings.join(' ')).toMatch(/no collection date/);
    expect(out.warnings.join(' ')).toMatch(/already on the patient/);
  });

  it('passes on why a report could not be read, so the doctor types it in', async () => {
    const { service } = make({ status: 'NOT_CONFIGURED', reason: 'Reading reports automatically isn’t set up' });
    expect(await service.readReport('doc-1', 'r-1')).toMatchObject({ status: 'NOT_CONFIGURED', results: [] });
  });
});
