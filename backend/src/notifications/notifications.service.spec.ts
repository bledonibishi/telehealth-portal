import { NotificationsService } from './notifications.service';

function makePrisma() {
  return {
    lead: { count: jest.fn().mockResolvedValue(0) },
    consultation: { count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn().mockResolvedValue([{ n: 0 }]),
    order: { count: jest.fn().mockResolvedValue(0) },
  };
}

const shipments = { dueCount: jest.fn().mockResolvedValue(0) };

describe('NotificationsService.getCounts — missed doses', () => {
  it('only scans for prescribers; other staff get 0', async () => {
    const dosing = { missedDoseAlerts: jest.fn().mockResolvedValue([{}, {}]) };
    const service = new NotificationsService(makePrisma() as any, dosing as any, shipments as any);

    expect((await service.getCounts()).missedDoseAlerts).toBe(0);
    expect(dosing.missedDoseAlerts).not.toHaveBeenCalled();
    expect((await service.getCounts({ includeMissedDoses: true })).missedDoseAlerts).toBe(2);
  });

  it('reuses a recent count instead of rescanning on every poll', async () => {
    const dosing = { missedDoseAlerts: jest.fn().mockResolvedValue([{}]) };
    const service = new NotificationsService(makePrisma() as any, dosing as any, shipments as any);
    await service.getCounts({ includeMissedDoses: true });
    await service.getCounts({ includeMissedDoses: true });
    expect(dosing.missedDoseAlerts).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationsService.getCounts — shipments due', () => {
  it('only counts for fulfilment staff and prescribers; everyone else gets 0', async () => {
    const dueCount = jest.fn().mockResolvedValue(4);
    const service = new NotificationsService(makePrisma() as any, { missedDoseAlerts: jest.fn() } as any, { dueCount } as any);

    expect((await service.getCounts()).shipmentsDue).toBe(0);
    expect(dueCount).not.toHaveBeenCalled();
    expect((await service.getCounts({ includeShipments: true })).shipmentsDue).toBe(4);
  });
});

describe('NotificationsService.getCounts — order problems', () => {
  it('does not count an order that cannot be supplied both as pending and as a problem', async () => {
    const prisma: any = {
      ...makePrisma(),
      order: {
        count: jest.fn().mockResolvedValue(5),
        findMany: jest.fn().mockResolvedValue([
          { status: 'PENDING', estimatedDeliveryTo: null, trackingEvents: [{ status: 'CANNOT_FULFIL' }] },
          { status: 'PENDING', estimatedDeliveryTo: null, trackingEvents: [{ status: 'CANNOT_FULFIL' }] },
          { status: 'DISPATCHED', estimatedDeliveryTo: null, trackingEvents: [{ status: 'DELIVERY_FAILED' }] },
        ]),
      },
      refundRequest: { count: jest.fn().mockResolvedValue(0) },
    };
    const counts = await new NotificationsService(prisma, {} as any, {} as any).getCounts({ includeOrderProblems: true });
    expect(counts.orderProblems).toBe(3);
    expect(counts.pendingOrders).toBe(3);
  });
});

describe('NotificationsService.getCounts — messages awaiting a reply', () => {
  // The count is one SQL query, so what matters is its shape: one row per thread, not per patient.
  it('counts each conversation thread of a patient, not just their newest message', async () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma as any, { missedDoseAlerts: jest.fn() } as any, shipments as any);
    await service.getCounts();
    const sql = prisma.$queryRaw.mock.calls.map((c: any[]) => (c[0].strings ?? c[0]).join(' ')).find((q: string) => q.includes('DISTINCT ON'));
    expect(sql).toContain('DISTINCT ON (m.patient_id, m.consultation_id)');
    expect(sql).toContain('ORDER BY m.patient_id, m.consultation_id, m.sent_at DESC');
  });
});

describe('NotificationsService.getCounts — tickets', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const build = (tickets: any[]) => {
    const prisma: any = { ...makePrisma(), ticket: { findMany: jest.fn().mockResolvedValue(tickets) } };
    return { prisma, service: new NotificationsService(prisma, { missedDoseAlerts: jest.fn().mockResolvedValue([]) } as any, shipments as any) };
  };

  it('counts nothing without a ticket scope (the pharmacy)', async () => {
    const { service, prisma } = build([]);
    expect(await service.getCounts()).toMatchObject({ ticketsToDo: 0, ticketsOverdue: 0 });
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it('counts what is open and nobody’s or mine, and how many of those are late for a first reply', async () => {
    const { service, prisma } = build([
      { createdAt: hoursAgo(30), priority: 'NORMAL', status: 'OPEN', firstResponseAt: null }, // late: 24 h allowed
      { createdAt: hoursAgo(2), priority: 'NORMAL', status: 'OPEN', firstResponseAt: null },
      { createdAt: hoursAgo(5), priority: 'HIGH', status: 'IN_PROGRESS', firstResponseAt: new Date() }, // already answered
    ]);
    const c = await service.getCounts({ tickets: { userId: 'cx-1', kind: 'NON_CLINICAL' } });
    expect(c).toMatchObject({ ticketsToDo: 3, ticketsOverdue: 1 });
    const where = prisma.ticket.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['OPEN', 'IN_PROGRESS'] });
    expect(where.OR).toEqual([{ assigneeId: null }, { assigneeId: 'cx-1' }]);
    expect(where.type).toEqual({ not: 'CLINICAL' });
  });

  it('a doctor counts only the medical ones', async () => {
    const { service, prisma } = build([]);
    await service.getCounts({ tickets: { userId: 'dr-1', kind: 'CLINICAL' } });
    expect(prisma.ticket.findMany.mock.calls[0][0].where.type).toBe('CLINICAL');
  });
});
