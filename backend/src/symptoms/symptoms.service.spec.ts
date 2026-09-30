import { SymptomsService } from './symptoms.service';
import { SCALES } from './symptom-scales';

function makePrisma(kind: string | null, consultationKinds: string[] = []) {
  const prisma: any = {
    patient: {
      findUnique: jest.fn().mockResolvedValue({ id: 'p-1', lead: kind ? { productKind: kind } : null, consultations: consultationKinds.map((k) => ({ kind: k })) }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    symptomAssessment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'a-1', recordedAt: new Date(), ...data })),
      update: jest.fn(({ where, data }) => Promise.resolve({ id: where.id, patientId: 'p-1', recordedAt: new Date(), ...data })),
    },
  };
  prisma.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(prisma));
  return prisma;
}

const mrsAnswers = (score: number) => SCALES.MRS.items.map((i) => ({ itemId: i.id, score }));

describe('SymptomsService', () => {
  it('gives HRT patients the MRS and GLP-1 patients no scale', async () => {
    expect((await new SymptomsService(makePrisma('HRT') as any).scaleFor('p-1'))?.id).toBe('MRS');
    expect(await new SymptomsService(makePrisma('GLP1') as any).scaleFor('p-1')).toBeNull();
  });

  it('goes by the latest consultation when the patient has changed programme', async () => {
    // Signed up for HRT, since moved to GLP-1: no scale.
    expect(await new SymptomsService(makePrisma('HRT', ['HRT', 'GLP1']) as any).scaleFor('p-1')).toBeNull();
    // Signed up for GLP-1, since moved to HRT: the MRS.
    expect((await new SymptomsService(makePrisma('GLP1', ['GLP1', 'HRT']) as any).scaleFor('p-1'))?.id).toBe('MRS');
  });

  it('serialises saves per patient and scale inside one transaction', async () => {
    const prisma = makePrisma('HRT');
    await new SymptomsService(prisma as any).record('p-1', mrsAnswers(1));

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [sql, key] = prisma.$executeRaw.mock.calls[0];
    expect(sql.join('?')).toMatch(/pg_advisory_xact_lock\(hashtext\(\?\)\)/);
    expect(key).toBe('symptoms:p-1:MRS');
    // The lock is taken before the recent-row check.
    expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.symptomAssessment.findFirst.mock.invocationCallOrder[0]);
  });

  it('records a complete assessment with its total', async () => {
    const prisma = makePrisma('HRT');
    const result = await new SymptomsService(prisma as any).record('p-1', mrsAnswers(2));

    expect(prisma.symptomAssessment.create).toHaveBeenCalledWith({
      data: { patientId: 'p-1', scale: 'MRS', answers: mrsAnswers(2), totalScore: 22 },
    });
    expect(result.totalScore).toBe(22);
    expect(result.severity).toBe('Severe');
    expect(result.domainScores.map((d) => d.score)).toEqual([8, 8, 6]);
  });

  it('replaces an assessment made in the last 24 hours instead of adding another', async () => {
    const prisma = makePrisma('HRT');
    prisma.symptomAssessment.findFirst.mockResolvedValue({ id: 'recent' });
    await new SymptomsService(prisma as any).record('p-1', mrsAnswers(1));

    expect(prisma.symptomAssessment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ patientId: 'p-1', scale: 'MRS', recordedAt: { gte: expect.any(Date) } }) }),
    );
    expect(prisma.symptomAssessment.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'recent' } }));
    expect(prisma.symptomAssessment.create).not.toHaveBeenCalled();
  });

  it('refuses incomplete answers and programmes without a scale', async () => {
    await expect(new SymptomsService(makePrisma('HRT') as any).record('p-1', mrsAnswers(1).slice(2))).rejects.toThrow(/answer every question/);
    await expect(new SymptomsService(makePrisma('GLP1') as any).record('p-1', mrsAnswers(1))).rejects.toThrow(/isn’t part of your programme/);
  });

  it('limits a patient’s own history to their current scale', async () => {
    const prisma = makePrisma('HRT');
    await new SymptomsService(prisma as any).ownHistory('p-1');
    expect(prisma.symptomAssessment.findMany).toHaveBeenCalledWith({ where: { patientId: 'p-1', scale: 'MRS' }, orderBy: { recordedAt: 'asc' } });

    const glp1 = makePrisma('GLP1');
    expect(await new SymptomsService(glp1 as any).ownHistory('p-1')).toEqual([]);
    expect(glp1.symptomAssessment.findMany).not.toHaveBeenCalled();
  });

  it('returns history oldest first with derived scores', async () => {
    const prisma = makePrisma('HRT');
    prisma.symptomAssessment.findMany.mockResolvedValue([
      { id: 'a', scale: 'MRS', answers: mrsAnswers(3), totalScore: 33, recordedAt: new Date('2026-08-01') },
      { id: 'b', scale: 'MRS', answers: mrsAnswers(1), totalScore: 11, recordedAt: new Date('2026-09-01') },
    ]);
    const history = await new SymptomsService(prisma as any).history('p-1');

    expect(prisma.symptomAssessment.findMany).toHaveBeenCalledWith({ where: { patientId: 'p-1' }, orderBy: { recordedAt: 'asc' } });
    expect(history.map((h) => [h.totalScore, h.severity])).toEqual([[33, 'Severe'], [11, 'Moderate']]);
  });
});
