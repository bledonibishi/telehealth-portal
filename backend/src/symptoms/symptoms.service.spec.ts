import { SymptomsService } from './symptoms.service';
import { SCALES } from './symptom-scales';

function makePrisma(kind: string | null) {
  return {
    patient: {
      findUnique: jest.fn().mockResolvedValue(kind === undefined ? null : { id: 'p-1', lead: kind ? { productKind: kind } : null, consultations: [] }),
    },
    symptomAssessment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'a-1', recordedAt: new Date(), ...data })),
      update: jest.fn(({ where, data }) => Promise.resolve({ id: where.id, patientId: 'p-1', recordedAt: new Date(), ...data })),
    },
  };
}

const mrsAnswers = (score: number) => SCALES.MRS.items.map((i) => ({ itemId: i.id, score }));

describe('SymptomsService', () => {
  it('gives HRT patients the MRS and GLP-1 patients no scale', async () => {
    expect((await new SymptomsService(makePrisma('HRT') as any).scaleFor('p-1'))?.id).toBe('MRS');
    expect(await new SymptomsService(makePrisma('GLP1') as any).scaleFor('p-1')).toBeNull();
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
