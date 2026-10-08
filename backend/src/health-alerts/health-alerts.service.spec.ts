import { HealthAlertsService } from './health-alerts.service';

const NOW = new Date('2026-11-02T09:00:00Z');
const DAY = 86_400_000;
const person = (id: string, first: string) => ({ id, firstName: first, lastName: 'Test' });

describe('HealthAlertsService', () => {
  let prisma: any;
  let weights: { trendsFor: jest.Mock };
  let service: HealthAlertsService;

  beforeEach(() => {
    prisma = {
      patient: {
        findMany: jest.fn().mockResolvedValue([
          { ...person('g1', 'Ana'), lead: { productKind: 'GLP1' }, consultations: [] },
          { ...person('g2', 'Ben'), lead: null, consultations: [{ kind: 'GLP1' }] },
          { ...person('h1', 'Hana'), lead: { productKind: 'HRT' }, consultations: [{ kind: 'HRT' }] },
        ]),
      },
      sideEffectReport: { findMany: jest.fn().mockResolvedValue([{ effects: ['vomiting'], patient: person('g1', 'Ana') }]) },
      consultation: { findMany: jest.fn().mockResolvedValue([{ id: 'con-1', submittedAt: new Date(NOW.getTime() - 3 * DAY), patient: person('c1', 'Cleo') }]) },
      auditLogEntry: { findMany: jest.fn().mockResolvedValue([]) },
      checkIn: { findMany: jest.fn().mockResolvedValue([{ patient: person('g2', 'Ben') }]) },
      prescription: { findMany: jest.fn().mockResolvedValue([{ validUntil: new Date(NOW.getTime() + 3 * DAY), patient: person('g1', 'Ana') }]) },
    };
    weights = {
      trendsFor: jest.fn().mockResolvedValue(new Map([
        ['g1', { level: 'GAIN', changePct28Days: 4.5, latestKg: null, previousKg: null }],
        ['g2', { level: 'HOLDING', changePct28Days: 0, latestKg: null, previousKg: null }],
      ])),
    };
    service = new HealthAlertsService(prisma, weights as any);
  });

  it('gathers the alerts, most urgent first', async () => {
    const alerts = await service.alerts(NOW);
    expect(alerts.map((a) => a.id)).toEqual(['SEVERE_SIDE_EFFECT:g1', 'WEIGHT_GAIN:g1', 'PENDING_REVIEWS', 'OVERDUE_CHECK_INS', 'PRESCRIPTIONS_EXPIRING']);
    expect(alerts[0]).toMatchObject({ level: 'RED', value: 4.5, patients: [{ id: 'g1', name: 'Ana Test' }] });
  });

  it('works out weight trends only for patients on the weight programme, whichever way their programme is recorded', async () => {
    await service.alerts(NOW);
    expect(weights.trendsFor).toHaveBeenCalledWith(['g1', 'g2'], NOW);
  });

  it('only asks about severe reports nobody has acknowledged, and live patients', async () => {
    await service.alerts(NOW);
    expect(prisma.sideEffectReport.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ severity: 'SEVERE', acknowledgedAt: null }) }));
    expect(prisma.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { activatedAt: { not: null }, subscriptionEndedAt: null } }));
  });

  it('counts a reply to a doctor’s question from the reply, not from the first submission days earlier', async () => {
    expect((await service.alerts(NOW)).map((a) => a.kind)).toContain('PENDING_REVIEWS'); // 3 days, never sent back
    prisma.auditLogEntry.findMany.mockResolvedValue([
      { resourceId: 'con-1', timestamp: new Date(NOW.getTime() - 2 * DAY) },
      { resourceId: 'con-1', timestamp: new Date(NOW.getTime() - 2 * 3_600_000) }, // replied again two hours ago
    ]);
    const fresh = await new HealthAlertsService(prisma, weights as any).alerts(NOW);
    expect(fresh.map((a) => a.kind)).not.toContain('PENDING_REVIEWS');
    expect(prisma.auditLogEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { action: 'CONSULTATION_RESUBMITTED', resourceType: 'Consultation', resourceId: { in: ['con-1'] } } }));
  });

  it('reads the database once for requests that arrive close together', async () => {
    await service.alerts(NOW);
    await service.alerts(new Date(NOW.getTime() + 10_000));
    expect(prisma.patient.findMany).toHaveBeenCalledTimes(1);
    await service.alerts(new Date(NOW.getTime() + 60_000));
    expect(prisma.patient.findMany).toHaveBeenCalledTimes(2);
  });
});
