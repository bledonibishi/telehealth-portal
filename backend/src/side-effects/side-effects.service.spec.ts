import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MAX_REPORTS_PER_DAY, OPEN_ALERTS_WHERE, SIDE_EFFECT_KEYS, adviceFor, byUrgency } from './side-effects';
import { SideEffectsService } from './side-effects.service';

describe('SideEffectsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: SideEffectsService;
  const row = (over: object = {}) => ({ id: 'se-1', patientId: 'p-1', effects: ['nausea'], severity: 'MILD', note: null, medication: 'Semaglutide 0.25 mg', createdAt: new Date('2026-10-01T10:00:00Z'), acknowledgedAt: null, acknowledgedById: null, ...over });

  beforeEach(() => {
    prisma = {
      sideEffectReport: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => Promise.resolve(row(data))),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(row()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(row({ acknowledgedAt: new Date() })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      sideEffectLog: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => Promise.resolve({ id: 'log-1', recordedAt: new Date('2026-10-30T10:00:00Z'), note: null, ...data })),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      doseEvent: { count: jest.fn().mockResolvedValue(0) },
      prescription: { findFirst: jest.fn().mockResolvedValue({ medication: 'Semaglutide', dosage: '0.25 mg' }) },
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
    };
    audit = { log: jest.fn() };
    service = new SideEffectsService(prisma, audit as any);
  });

  describe('report', () => {
    it('saves it with what the patient was on, and records it against the patient', async () => {
      const report = await service.report('p-1', { effects: ['nausea', 'fatigue'], severity: 'MILD' as any, note: '  after dinner  ' });
      expect(prisma.sideEffectReport.create).toHaveBeenCalledWith({
        data: { patientId: 'p-1', effects: ['nausea', 'fatigue'], severity: 'MILD', note: 'after dinner', medication: 'Semaglutide 0.25 mg' },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SIDE_EFFECT_REPORTED', actorId: 'p-1', patientId: 'p-1' }), prisma);
      expect(report.advice).toBeUndefined();
    });

    it('tells the patient to seek urgent help for a severe one', async () => {
      const report = await service.report('p-1', { effects: ['vomiting'], severity: 'SEVERE' as any });
      expect(report.advice).toMatch(/112/);
    });

    it('works without an active prescription', async () => {
      prisma.prescription.findFirst.mockResolvedValue(null);
      await service.report('p-1', { effects: ['nausea'], severity: 'MILD' as any });
      expect(prisma.sideEffectReport.create.mock.calls[0][0].data.medication).toBeNull();
    });

    it('needs known effects, drops duplicates, and keeps notes short', async () => {
      await expect(service.report('p-1', { effects: [], severity: 'MILD' as any })).rejects.toThrow(/at least one/);
      await expect(service.report('p-1', { effects: ['made-up'], severity: 'MILD' as any })).rejects.toThrow(/Unknown/);
      await expect(service.report('p-1', { effects: ['nausea'], severity: 'MILD' as any, note: 'x'.repeat(501) })).rejects.toThrow(/500/);
      await service.report('p-1', { effects: ['nausea', 'nausea'], severity: 'MILD' as any });
      expect(prisma.sideEffectReport.create.mock.calls[0][0].data.effects).toEqual(['nausea']);
    });

    it('stops a runaway client', async () => {
      prisma.sideEffectReport.count.mockResolvedValue(MAX_REPORTS_PER_DAY);
      await expect(service.report('p-1', { effects: ['nausea'], severity: 'MILD' as any })).rejects.toThrow(BadRequestException);
      expect(prisma.sideEffectReport.create).not.toHaveBeenCalled();
    });

    it('fails the report when it cannot be audited', async () => {
      audit.log.mockRejectedValue(new Error('Audit log write failed'));
      await expect(service.report('p-1', { effects: ['nausea'], severity: 'MILD' as any })).rejects.toThrow('Audit log write failed');
    });
  });

  describe('mine', () => {
    it('lists only the signed-in patient’s own reports', async () => {
      await service.mine('p-1');
      expect(prisma.sideEffectReport.findMany.mock.calls[0][0].where).toEqual({ patientId: 'p-1' });
    });
  });

  describe('alerts', () => {
    it('lists unacknowledged reports, most severe first then longest waiting, with the patient’s name', async () => {
      const patient = { id: 'p-1', firstName: 'Tia', lastName: 'Berisha' };
      prisma.sideEffectReport.findMany.mockResolvedValue([
        row({ id: 'old-mild', severity: 'MILD', createdAt: new Date('2026-09-28'), patient }),
        row({ id: 'new-severe', severity: 'SEVERE', createdAt: new Date('2026-10-02'), patient }),
        row({ id: 'mid-moderate', severity: 'MODERATE', createdAt: new Date('2026-09-30'), patient }),
        row({ id: 'old-severe', severity: 'SEVERE', createdAt: new Date('2026-10-01'), patient }),
      ]);
      const alerts = await service.alerts();
      expect(prisma.sideEffectReport.findMany.mock.calls[0][0].where).toBe(OPEN_ALERTS_WHERE);
      // severity decides before the limit does, so a newer severe report can't be cut off by older mild ones
      expect(prisma.sideEffectReport.findMany.mock.calls[0][0].orderBy).toEqual([{ severity: 'desc' }, { createdAt: 'asc' }]);
      expect(alerts.map((a) => a.id)).toEqual(['old-severe', 'new-severe', 'mid-moderate', 'old-mild']);
      expect(alerts[0]).toMatchObject({ patientId: 'p-1', patientName: 'Tia Berisha' });
    });
  });

  describe('acknowledge', () => {
    it('marks it seen and audits it against the patient', async () => {
      await service.acknowledge('doc-1', 'se-1');
      expect(prisma.sideEffectReport.updateMany).toHaveBeenCalledWith({ where: { id: 'se-1', acknowledgedAt: null }, data: { acknowledgedAt: expect.any(Date), acknowledgedById: 'doc-1' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SIDE_EFFECT_ACKNOWLEDGED', actorId: 'doc-1', patientId: 'p-1' }), prisma);
    });

    it('lets the first acknowledgement stand and does not audit a second one', async () => {
      prisma.sideEffectReport.updateMany.mockResolvedValue({ count: 0 });
      await service.acknowledge('doc-2', 'se-1');
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('is not found for an unknown report', async () => {
      prisma.sideEffectReport.findUnique.mockResolvedValue(null);
      await expect(service.acknowledge('doc-1', 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('weekly scores', () => {
    const scores = (over: object = {}) => ({ nausea: 2, vomiting: 1, abdominalPain: 1, diarrhoea: 1, constipation: 3, fatigue: 2, ...over });

    it('saves a quiet week without alerting anyone', async () => {
      const entry = await service.logScores('p-1', { ...scores(), note: ' ok ', clientRequestId: 'r-1' });
      expect(prisma.sideEffectLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ patientId: 'p-1', nausea: 2, constipation: 3, note: 'ok', clientRequestId: 'r-1' }) });
      expect(prisma.sideEffectReport.create).not.toHaveBeenCalled();
      expect(entry.advice).toBeUndefined();
    });

    it('raises an ordinary side-effect report, in the same transaction, when a score is high', async () => {
      const entry = await service.logScores('p-1', scores({ nausea: 8, abdominalPain: 7 }));
      expect(prisma.sideEffectReport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ patientId: 'p-1', effects: ['nausea', 'abdominal_pain'], severity: 'MODERATE', medication: 'Semaglutide 0.25 mg', note: expect.stringContaining('nausea 8/10') }),
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SIDE_EFFECT_REPORTED', patientId: 'p-1' }), prisma);
      expect(entry.advice).toMatch(/112/);
    });

    it('makes it severe from 9', async () => {
      await service.logScores('p-1', scores({ vomiting: 9 }));
      expect(prisma.sideEffectReport.create).toHaveBeenCalledWith({ data: expect.objectContaining({ severity: 'SEVERE', effects: ['vomiting'] }) });
    });

    it.each([[0], [11], [4.5]])('refuses a score of %s', async (bad) => {
      await expect(service.logScores('p-1', scores({ nausea: bad }))).rejects.toThrow(BadRequestException);
      expect(prisma.sideEffectLog.create).not.toHaveBeenCalled();
    });

    it('does not save the same submission twice', async () => {
      prisma.sideEffectLog.findFirst.mockResolvedValue({ id: 'log-1', recordedAt: new Date(), note: null, ...scores() });
      await service.logScores('p-1', { ...scores(), clientRequestId: 'r-1' });
      expect(prisma.sideEffectLog.create).not.toHaveBeenCalled();
    });

    it('stops a runaway client', async () => {
      prisma.sideEffectLog.count.mockResolvedValue(3);
      await expect(service.logScores('p-1', scores())).rejects.toThrow(/already logged this today/);
    });
  });

  describe('summaryFor', () => {
    const now = new Date('2026-10-30T12:00:00Z');
    const log = (daysAgo: number, over: object = {}) => ({ id: `l-${daysAgo}`, recordedAt: new Date(now.getTime() - daysAgo * 86_400_000), note: null, nausea: 1, vomiting: 1, abdominalPain: 1, diarrhoea: 1, constipation: 1, fatigue: 1, ...over });

    it('needs attention when the latest week has a high score', async () => {
      prisma.sideEffectLog.findMany.mockResolvedValue([log(2, { nausea: 8 }), log(9, { nausea: 3 })]);
      const s = await service.summaryFor('p-1', now);
      expect(s.needsAttention).toBe(true);
      expect(s.reasons).toEqual(['Nausea 8/10 at the last check']);
      expect(s.scores.find((r) => r.key === 'nausea')).toMatchObject({ latest: 8, previous: 3, peak: 8, flagged: true });
      expect(s.stale).toBe(false);
    });

    it('needs attention for an unacknowledged report or a rough dose, even with no tracker entries', async () => {
      prisma.sideEffectReport.findMany.mockResolvedValue([row({ severity: 'SEVERE' })]);
      prisma.doseEvent.count.mockResolvedValue(1);
      const s = await service.summaryFor('p-1', now);
      expect(s).toMatchObject({ needsAttention: true, stale: true, scores: [], roughDoses: 1 });
      expect(s.reasons).toEqual(['1 reported side effect not yet acknowledged', 'Felt unwell after 1 recent dose']);
    });

    it('is calm when there is nothing to flag, and stale when nothing has been logged', async () => {
      const s = await service.summaryFor('p-1', now);
      expect(s).toMatchObject({ needsAttention: false, reasons: [], stale: true });
    });
  });
});

describe('side effect helpers', () => {
  it('offers the effects the check-in asks about, plus a way to say something else', () => {
    expect(SIDE_EFFECT_KEYS).toEqual(expect.arrayContaining(['nausea', 'vomiting', 'fatigue', 'other']));
  });

  it('gives urgent advice for severe and moderate reports, and none for mild ones', () => {
    expect(adviceFor('SEVERE')).toMatch(/112/);
    expect(adviceFor('MODERATE')).toMatch(/message your clinician/);
    expect(adviceFor('MILD')).toBeNull();
  });

  it('orders by severity, then age', () => {
    const at = (d: string) => new Date(d);
    expect(byUrgency({ severity: 'SEVERE', createdAt: at('2026-10-02') }, { severity: 'MILD', createdAt: at('2026-09-01') })).toBeLessThan(0);
    expect(byUrgency({ severity: 'MILD', createdAt: at('2026-09-01') }, { severity: 'MILD', createdAt: at('2026-09-02') })).toBeLessThan(0);
  });
});
