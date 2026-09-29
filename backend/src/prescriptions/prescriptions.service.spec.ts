import { PrescriptionsService } from './prescriptions.service';

describe('PrescriptionsService', () => {
  let prisma: any;
  let orders: { cancelPendingFor: jest.Mock };
  let audit: { log: jest.Mock };
  let service: PrescriptionsService;

  beforeEach(() => {
    audit = { log: jest.fn() };
    prisma = {
      prescription: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
    };
    orders = { cancelPendingFor: jest.fn() };
    service = new PrescriptionsService(prisma, audit as any, orders as any);
  });

  describe('cancel', () => {
    it('cancels an active prescription and audits the reason', async () => {
      prisma.prescription.findUnique.mockResolvedValue({ id: 'rx-1', status: 'ACTIVE' });
      prisma.prescription.update.mockResolvedValue({ id: 'rx-1', status: 'CANCELLED' });

      await service.cancel('doc-1', 'rx-1', ' Side effects ');

      expect(prisma.prescription.update).toHaveBeenCalledWith({
        where: { id: 'rx-1' },
        data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'Side effects' }),
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PRESCRIPTION_CANCELLED' }));
    });

    it('cancels orders the pharmacy has not dispatched yet', async () => {
      prisma.prescription.findUnique.mockResolvedValue({ id: 'rx-1', status: 'ACTIVE' });
      await service.cancel('doc-1', 'rx-1', 'Side effects');
      expect(orders.cancelPendingFor).toHaveBeenCalledWith('rx-1', 'Prescription cancelled: Side effects', prisma);
    });

    it('refuses without a reason', async () => {
      await expect(service.cancel('doc-1', 'rx-1', '  ')).rejects.toThrow(/reason is required/);
    });

    it('refuses to cancel a superseded prescription', async () => {
      prisma.prescription.findUnique.mockResolvedValue({ id: 'rx-1', status: 'SUPERSEDED' });
      await expect(service.cancel('doc-1', 'rx-1', 'x')).rejects.toThrow(/Only an active prescription/);
    });
  });
});
