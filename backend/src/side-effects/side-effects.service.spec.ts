import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MAX_REPORTS_PER_DAY, SIDE_EFFECT_KEYS, adviceFor, byUrgency } from './side-effects';
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
      expect(prisma.sideEffectReport.findMany.mock.calls[0][0].where).toMatchObject({ acknowledgedAt: null });
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
