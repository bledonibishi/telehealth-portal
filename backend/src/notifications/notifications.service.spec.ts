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
