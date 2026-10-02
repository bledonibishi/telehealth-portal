import { ShipmentsService } from './shipments.service';

const DAY = 86_400_000;
const NOW = new Date('2026-10-15T12:00:00Z');

function build() {
  const rx = {
    id: 'rx-1', medication: 'Wegovy', refillsAllowed: 3,
    patient: { id: 'p-1', firstName: 'Sofia', lastName: 'Meyer' },
    orders: [{ status: 'DELIVERED', dispatchedAt: new Date(NOW.getTime() - 30 * DAY) }],
  };
  const prisma: any = {
    prescription: { findMany: jest.fn().mockResolvedValue([rx]) },
    checkIn: {
      groupBy: jest.fn(({ where }: any) =>
        Promise.resolve(where.completedAt ? [{ patientId: 'p-1', _max: { completedAt: new Date(NOW.getTime() - 3 * DAY) } }] : [{ patientId: 'p-1' }]),
      ),
      findMany: jest.fn().mockResolvedValue([{ patientId: 'p-1', completedAt: new Date(NOW.getTime() - 3 * DAY), reviewedAt: new Date(NOW.getTime() - 2 * DAY), outcome: 'REPEAT' }]),
    },
  };
  const service = new ShipmentsService(prisma, { get: jest.fn() } as any);
  return { service, prisma };
}

describe('ShipmentsService', () => {
  it('reads one check-in per patient, not their whole history', async () => {
    const { service, prisma } = build();
    const alerts = await service.nextShipments(NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ patientId: 'p-1', blocker: 'NONE', urgency: 'DUE' });

    // the latest completion time per patient, then only those rows
    expect(prisma.checkIn.groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['patientId'], _max: { completedAt: true } }));
    expect(prisma.checkIn.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.checkIn.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ patientId: 'p-1', completedAt: new Date(NOW.getTime() - 3 * DAY) }]);
  });

  it('leaves out patients whose subscription has ended', async () => {
    const { service, prisma } = build();
    await service.nextShipments(NOW);
    expect(prisma.prescription.findMany.mock.calls[0][0].where.patient).toEqual({ activatedAt: { not: null }, subscriptionEndedAt: null });
  });

  it('does not read check-ins at all when nobody has an active shipped prescription', async () => {
    const { service, prisma } = build();
    prisma.prescription.findMany.mockResolvedValue([]);
    expect(await service.nextShipments(NOW)).toEqual([]);
    expect(prisma.checkIn.groupBy).not.toHaveBeenCalled();
  });

  describe('sharing the list for a short while', () => {
    it('answers a second call for "now" from memory', async () => {
      const { service, prisma } = build();
      await service.nextShipments();
      await service.nextShipments();
      await service.dueCount();
      expect(prisma.prescription.findMany).toHaveBeenCalledTimes(1);
    });

    it('computes afresh once told something changed', async () => {
      const { service, prisma } = build();
      await service.nextShipments();
      service.invalidate();
      await service.nextShipments();
      expect(prisma.prescription.findMany).toHaveBeenCalledTimes(2);
    });

    it('never serves a call about a specific moment from memory', async () => {
      const { service, prisma } = build();
      await service.nextShipments();
      await service.nextShipments(NOW);
      expect(prisma.prescription.findMany).toHaveBeenCalledTimes(2);
    });
  });
});
