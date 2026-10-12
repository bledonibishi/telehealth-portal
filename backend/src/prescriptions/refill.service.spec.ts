import { Prisma } from '@prisma/client';
import { RefillService } from './refill.service';

const DAY = 86_400_000;
const alert = (over: Record<string, unknown> = {}) => ({
  prescriptionId: 'rx-1', patientId: 'p-1', patientName: 'Sofia Meyer', medication: 'Wegovy 0.5 mg',
  lastShippedAt: new Date(Date.now() - 26 * DAY), nextDueAt: new Date(Date.now() + 4 * DAY), daysUntilDue: 4,
  urgency: 'UPCOMING', blocker: 'NONE', repeatsLeft: 2, refillRequestedAt: null, ...over,
});

function build(forPatient: any) {
  const prisma: any = {
    patient: { findUniqueOrThrow: jest.fn().mockResolvedValue({ activatedAt: new Date(), subscriptionEndedAt: null }) },
    order: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 1 } }) },
    refillRequest: { create: jest.fn().mockResolvedValue({}) },
  };
  const shipments: any = { forPatient: jest.fn().mockResolvedValue(forPatient), leadDays: 5, invalidate: jest.fn() };
  const audit = { log: jest.fn() };
  return { service: new RefillService(prisma, shipments, audit as any), prisma, shipments, audit };
}

describe('RefillService', () => {
  describe('status', () => {
    it('reports the subscription, the next supply and whether the patient can ask', async () => {
      const { service } = build(alert());
      expect(await service.status('p-1')).toMatchObject({ subscriptionActive: true, medication: 'Wegovy 0.5 mg', daysUntilNextSupply: 4, repeatsLeft: 2, refillState: 'READY', supplyBeingPrepared: false });
    });

    it('says how long until the button opens, and that an ended subscription is not active', async () => {
      const { service, prisma } = build(alert({ daysUntilDue: 12 }));
      prisma.patient.findUniqueOrThrow.mockResolvedValue({ activatedAt: new Date(), subscriptionEndedAt: new Date() });
      expect(await service.status('p-1')).toMatchObject({ subscriptionActive: false, refillState: 'NOT_YET', refillOpensInDays: 7 });
    });

    it('notes a supply the pharmacy is already preparing', async () => {
      const { service, prisma } = build(null);
      prisma.order.count.mockResolvedValue(1);
      expect(await service.status('p-1')).toMatchObject({ supplyBeingPrepared: true, refillState: 'UNAVAILABLE' });
    });
  });

  describe('request', () => {
    it('records the ask for the next order number, audits it and refreshes the doctors’ list', async () => {
      const { service, prisma, shipments, audit } = build(alert());
      await service.request('p-1');
      expect(prisma.refillRequest.create).toHaveBeenCalledWith({ data: { patientId: 'p-1', prescriptionId: 'rx-1', sequence: 2 } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'REFILL_REQUESTED', actorId: 'p-1', patientId: 'p-1' }));
      expect(shipments.invalidate).toHaveBeenCalled();
    });

    it('refuses before the window, before the check-in, and over the doctor’s review', async () => {
      await expect(build(alert({ daysUntilDue: 12 })).service.request('p-1')).rejects.toThrow(/too early/);
      await expect(build(alert({ blocker: 'AWAITING_CHECKIN' })).service.request('p-1')).rejects.toThrow(/check-in first/);
      await expect(build(alert({ blocker: 'AWAITING_REVIEW' })).service.request('p-1')).rejects.toThrow(/already reviewing/);
      await expect(build(null).service.request('p-1')).rejects.toThrow(/nothing to refill/);
    });

    it('does nothing more when they have already asked', async () => {
      const { service, prisma } = build(alert({ refillRequestedAt: new Date() }));
      await service.request('p-1');
      expect(prisma.refillRequest.create).not.toHaveBeenCalled();
    });

    it('treats a double tap that loses the race as the same request', async () => {
      const { service, prisma } = build(alert());
      prisma.refillRequest.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      await expect(service.request('p-1')).resolves.toMatchObject({ subscriptionActive: true });
    });

    it('lets any other failure through', async () => {
      const { service, prisma } = build(alert());
      prisma.refillRequest.create.mockRejectedValue(new Error('db down'));
      await expect(service.request('p-1')).rejects.toThrow('db down');
    });
  });
});
