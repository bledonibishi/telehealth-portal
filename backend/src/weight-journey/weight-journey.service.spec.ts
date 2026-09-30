import { BadRequestException } from '@nestjs/common';
import { WeightJourneyService } from './weight-journey.service';

const intake = (kg: string) => [{ questionId: 'height_cm', value: '170' }, { questionId: 'weight_kg', value: kg, answer: `${kg} kg` }];
const done = (id: string, daysAgo: number, kg: number, feeling = 'GOOD', notes?: string) => ({
  id,
  status: 'COMPLETED',
  completedAt: new Date(Date.now() - daysAgo * 86_400_000),
  weightKg: kg,
  feeling,
  answers: notes ? [{ questionId: 'notes', answer: notes }] : [],
});

describe('WeightJourneyService', () => {
  let patient: any;
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: WeightJourneyService;

  beforeEach(() => {
    patient = {
      id: 'p-1',
      lead: { productKind: 'GLP1' },
      weightGoal: null,
      consultations: [{ kind: 'GLP1', quizAnswers: intake('120') }],
      checkIns: [],
      weightEntries: [],
    };
    prisma = {
      patient: { findUnique: jest.fn().mockImplementation(() => Promise.resolve(patient)) },
      weightGoal: { upsert: jest.fn().mockResolvedValue({}) },
      checkIn: { findUnique: jest.fn(), update: jest.fn() },
    };
    audit = { log: jest.fn() };
    service = new WeightJourneyService(prisma, audit as any, { buildUrl: (t: string) => `http://app/checkin?token=${t}` } as any);
  });

  it('returns nothing for HRT patients', async () => {
    patient.lead.productKind = 'HRT';
    expect(await service.forPatient('p-1')).toBeNull();
  });

  it('starts from the intake weight, with no progress until a target is set', async () => {
    const j = (await service.forPatient('p-1'))!;
    expect(j).toMatchObject({ startingWeightKg: 120, currentWeightKg: 120 });
    expect(j.targetWeightKg).toBeUndefined();
    expect(j.progressPercentage).toBeUndefined();
    expect(j.entries).toEqual([]);
  });

  it('builds month numbers, changes and progress from completed check-ins', async () => {
    patient.weightGoal = { startingWeightKg: 120, targetWeightKg: 90 };
    patient.checkIns = [done('a', 60, 114), done('b', 30, 109, 'GREAT', ' Feeling strong '), done('c', 1, 105, 'OKAY')];
    const j = (await service.forPatient('p-1'))!;

    expect(j.entries.map((e) => [e.month, e.weightKg, e.previousWeightKg, e.changeKg])).toEqual([
      [1, 114, 120, -6],
      [2, 109, 114, -5],
      [3, 105, 109, -4],
    ]);
    expect(j.entries[1]).toMatchObject({ feeling: 'GREAT', note: 'Feeling strong' });
    expect(j).toMatchObject({ currentWeightKg: 105, weightLostKg: 15, remainingKg: 15, progressPercentage: 50 });
    expect(j.checkInState).toBe('COMPLETED');
  });

  it('is READY with a link while a check-in is sent and unexpired, and UPCOMING otherwise', async () => {
    patient.checkIns = [{ id: 's', status: 'SENT', token: 'tok', tokenExpiresAt: new Date(Date.now() + 86_400_000), dueAt: new Date() }];
    let j = (await service.forPatient('p-1'))!;
    expect(j.checkInState).toBe('READY');
    expect(j.checkInUrl).toBe('http://app/checkin?token=tok');

    patient.checkIns = [{ id: 's', status: 'SCHEDULED', dueAt: new Date(Date.now() + 5 * 86_400_000) }];
    j = (await service.forPatient('p-1'))!;
    expect(j.checkInState).toBe('UPCOMING');
    expect(j.checkInUrl).toBeUndefined();
  });

  describe('current weight from daily entries', () => {
    const daily = (daysAgo: number, kg: number) => ({ measuredAt: new Date(Date.now() - daysAgo * 86_400_000), weightKg: kg });

    it('uses a daily entry newer than the last check-in, and progress follows it', async () => {
      patient.weightGoal = { startingWeightKg: 120, targetWeightKg: 90 };
      patient.checkIns = [done('a', 20, 114)];
      patient.weightEntries = [daily(1, 108.5)];
      const j = (await service.forPatient('p-1'))!;
      expect(j).toMatchObject({ currentWeightKg: 108.5, weightLostKg: 11.5, remainingKg: 18.5, progressPercentage: 38.33 });
      expect(j.latestMeasurementAt).toEqual(patient.weightEntries[0].measuredAt);
      // The monthly history is untouched by daily entries.
      expect(j.entries.map((e) => [e.month, e.weightKg, e.changeKg])).toEqual([[1, 114, -6]]);
    });

    it('keeps the check-in weight when it is the newest measurement', async () => {
      patient.weightGoal = { startingWeightKg: 120, targetWeightKg: 90 };
      patient.checkIns = [done('a', 2, 112)];
      patient.weightEntries = [daily(9, 118)];
      expect((await service.forPatient('p-1'))!.currentWeightKg).toBe(112);
    });

    it('works with daily entries alone, before any check-in', async () => {
      patient.weightGoal = { startingWeightKg: 120, targetWeightKg: 90 };
      patient.weightEntries = [daily(0, 117.2)];
      expect(await service.forPatient('p-1')).toMatchObject({ currentWeightKg: 117.2, weightLostKg: 2.8, entries: [] });
    });
  });

  describe('setTarget', () => {
    it('saves the target with the intake weight as a fixed starting point', async () => {
      await service.setTarget('p-1', 90);
      expect(prisma.weightGoal.upsert.mock.calls[0][0].create).toEqual({ patientId: 'p-1', startingWeightKg: 120, targetWeightKg: 90 });
    });

    it('rejects targets that are not below the starting weight, or out of range', async () => {
      await expect(service.setTarget('p-1', 120)).rejects.toThrow(BadRequestException);
      await expect(service.setTarget('p-1', 25)).rejects.toThrow(/between 30 and 300/);
      await expect(service.setTarget('p-1', NaN)).rejects.toThrow(BadRequestException);
    });

    it('needs a starting weight', async () => {
      patient.consultations = [];
      await expect(service.setTarget('p-1', 90)).rejects.toThrow(/medical questionnaire/);
    });
  });

  describe('staff corrections', () => {
    it('corrects a check-in weight and audits the original', async () => {
      prisma.checkIn.findUnique.mockResolvedValue({ id: 'ci-1', patientId: 'p-1', status: 'COMPLETED', weightKg: 150 });
      await service.correctCheckInWeight('doc-1', { checkInId: 'ci-1', weightKg: 105.04, reason: 'typo' });
      expect(prisma.checkIn.update).toHaveBeenCalledWith({ where: { id: 'ci-1' }, data: { weightKg: 105 } });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CHECK_IN_WEIGHT_CORRECTED', resourceId: 'ci-1', metadata: { before: 150, after: 105, reason: 'typo' } }),
      );
    });

    it('refuses to correct a check-in that was never completed', async () => {
      prisma.checkIn.findUnique.mockResolvedValue({ id: 'ci-1', patientId: 'p-1', status: 'SENT' });
      await expect(service.correctCheckInWeight('doc-1', { checkInId: 'ci-1', weightKg: 100 })).rejects.toThrow(BadRequestException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('corrects the goal and audits before/after', async () => {
      patient.weightGoal = { startingWeightKg: 120, targetWeightKg: 90 };
      await service.correctGoal('doc-1', { patientId: 'p-1', targetWeightKg: 95 });
      expect(prisma.weightGoal.upsert.mock.calls[0][0].update).toEqual({ startingWeightKg: 120, targetWeightKg: 95 });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WEIGHT_GOAL_CORRECTED', metadata: expect.objectContaining({ before: { startingWeightKg: 120, targetWeightKg: 90 } }) }),
      );
    });
  });
});
