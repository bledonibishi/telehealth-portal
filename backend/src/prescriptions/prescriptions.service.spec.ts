import { PrescriptionsService } from './prescriptions.service';

describe('PrescriptionsService', () => {
  let prisma: { prescription: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock } };
  let service: PrescriptionsService;

  beforeEach(() => {
    prisma = {
      prescription: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    };
    service = new PrescriptionsService(prisma as any);
  });

  describe('findByConsultation', () => {
    it('looks up the prescription by consultation id', () => {
      service.findByConsultation('consult-1');

      expect(prisma.prescription.findUnique).toHaveBeenCalledWith({
        where: { consultationId: 'consult-1' },
      });
    });
  });

  describe('findAllOrders', () => {
    it('includes the consultation and patient, newest first', () => {
      service.findAllOrders();

      expect(prisma.prescription.findMany).toHaveBeenCalledWith({
        include: { consultation: { include: { patient: true } } },
        orderBy: { issuedAt: 'desc' },
      });
    });
  });

  describe('dispatch', () => {
    it('sets dispatchedAt and the pharmacy reference', () => {
      service.dispatch('rx-1', 'PH-001');

      expect(prisma.prescription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rx-1' },
          data: expect.objectContaining({ pharmacyRef: 'PH-001', dispatchedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
