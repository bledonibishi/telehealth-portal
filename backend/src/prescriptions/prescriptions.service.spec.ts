import { PrescriptionsService } from './prescriptions.service';

const PATIENT = { id: 'p-1', email: 'p@example.com', firstName: 'Tia' };
const ACTIVE_RX = { id: 'rx-1', status: 'ACTIVE', patientId: 'p-1' };

describe('PrescriptionsService', () => {
  let prisma: any;
  let orders: { cancelPendingFor: jest.Mock };
  let dosing: { cancelForPrescription: jest.Mock };
  let prescribing: { assertCanPrescribe: jest.Mock; assertIdentityVerified: jest.Mock; issue: jest.Mock };
  let messaging: { send: jest.Mock };
  let email: { sendConsultationUpdateEmail: jest.Mock };
  let audit: { log: jest.Mock };
  let partner: { trySendForPrescription: jest.Mock; flushCancellations: jest.Mock };
  let service: PrescriptionsService;

  beforeEach(() => {
    partner = { trySendForPrescription: jest.fn(), flushCancellations: jest.fn() };
    audit = { log: jest.fn() };
    prisma = {
      prescription: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      product: { findUnique: jest.fn().mockResolvedValue({ id: 'prod-1', kind: 'GLP1' }) },
      consultation: { findFirst: jest.fn().mockResolvedValue({ quizAnswers: [] }) },
      patient: { findUnique: jest.fn().mockResolvedValue(PATIENT) },
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
    };
    orders = { cancelPendingFor: jest.fn() };
    dosing = { cancelForPrescription: jest.fn() };
    prescribing = {
      assertCanPrescribe: jest.fn(),
      assertIdentityVerified: jest.fn(),
      issue: jest.fn().mockResolvedValue({ id: 'rx-2', medication: 'Semaglutide 0.5 mg' }),
    };
    messaging = { send: jest.fn() };
    email = { sendConsultationUpdateEmail: jest.fn() };
    service = new PrescriptionsService(
      prisma,
      audit as any,
      orders as any,
      dosing as any,
      prescribing as any,
      messaging as any,
      email as any,
      { get: jest.fn() } as any,
      partner as any,
    );
  });

  describe('cancel', () => {
    it('cancels an active prescription and audits the reason', async () => {
      prisma.prescription.findUnique.mockResolvedValue(ACTIVE_RX);
      prisma.prescription.update.mockResolvedValue({ id: 'rx-1', status: 'CANCELLED' });

      await service.cancel('doc-1', 'rx-1', ' Side effects ');

      expect(prisma.prescription.update).toHaveBeenCalledWith({
        where: { id: 'rx-1' },
        data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'Side effects' }),
      });
      // Recorded in the same transaction as the cancellation, against the patient.
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PRESCRIPTION_CANCELLED', patientId: 'p-1' }),
        prisma,
      );
    });

    it('cancels orders and scheduled doses the pharmacy/patient have not acted on yet', async () => {
      prisma.prescription.findUnique.mockResolvedValue({ id: 'rx-1', status: 'ACTIVE' });
      await service.cancel('doc-1', 'rx-1', 'Side effects');
      expect(orders.cancelPendingFor).toHaveBeenCalledWith('rx-1', 'Prescription cancelled: Side effects', prisma);
      expect(dosing.cancelForPrescription).toHaveBeenCalledWith('rx-1', prisma);
    });

    it('tells the pharmacy partner about the withdrawn orders once the change is saved', async () => {
      prisma.prescription.findUnique.mockResolvedValue({ id: 'rx-1', status: 'ACTIVE' });
      const order: string[] = [];
      prisma.$transaction.mockImplementation(async (fn: any) => { const r = await fn(prisma); order.push('committed'); return r; });
      partner.flushCancellations.mockImplementation(async () => { order.push('flushed'); });
      await service.cancel('doc-1', 'rx-1', 'Side effects');
      expect(order).toEqual(['committed', 'flushed']);
    });

    it('refuses without a reason', async () => {
      await expect(service.cancel('doc-1', 'rx-1', '  ')).rejects.toThrow(/reason is required/);
    });

    it('refuses to cancel a superseded prescription', async () => {
      prisma.prescription.findUnique.mockResolvedValue({ id: 'rx-1', status: 'SUPERSEDED' });
      await expect(service.cancel('doc-1', 'rx-1', 'x')).rejects.toThrow(/Only an active prescription/);
    });
  });

  describe('changeDose', () => {
    const input = {
      prescriptionId: 'rx-1',
      items: [{ productId: 'prod-1', strengthId: 'str-2', quantity: 1, directions: 'Weekly' }],
      reasonForChange: 'Tolerating well, stepping up',
    };

    beforeEach(() => {
      prisma.prescription.findUnique.mockResolvedValue(ACTIVE_RX);
    });

    it('checks the prescriber and patient, then supersedes the current prescription', async () => {
      const result = await service.changeDose('doc-1', input as any);

      expect(prescribing.assertCanPrescribe).toHaveBeenCalledWith('doc-1');
      expect(prescribing.assertIdentityVerified).toHaveBeenCalledWith('p-1');
      expect(prescribing.issue).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'p-1', prescriberId: 'doc-1', kind: 'GLP1', supersedesId: 'rx-1', items: input.items }),
        prisma,
      );
      expect(result.id).toBe('rx-2');
    });

    it('audits the change with the clinical reason', async () => {
      await service.changeDose('doc-1', input as any);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DOSE_CHANGED', resourceId: 'rx-2', patientId: 'p-1', metadata: expect.objectContaining({ supersedes: 'rx-1', reason: input.reasonForChange }) }),
        prisma,
      );
    });

    it('notifies the patient by email, and by message when one is given', async () => {
      prisma.consultation.findFirst.mockResolvedValue({ id: 'c-1', quizAnswers: [] });
      await service.changeDose('doc-1', { ...input, messageToPatient: 'Moving you to 0.5 mg' } as any);
      expect(messaging.send).toHaveBeenCalledWith('doc-1', 'CLINICIAN', { consultationId: 'c-1', content: 'Moving you to 0.5 mg' });
      expect(email.sendConsultationUpdateEmail).toHaveBeenCalled();
    });

    it('refuses without a reason', async () => {
      await expect(service.changeDose('doc-1', { ...input, reasonForChange: '  ' } as any)).rejects.toThrow(/reason is required/);
      expect(prescribing.issue).not.toHaveBeenCalled();
    });

    it('refuses an empty item list', async () => {
      await expect(service.changeDose('doc-1', { ...input, items: [] } as any)).rejects.toThrow(/at least one medicine/);
    });

    it('refuses when the prescription is not active', async () => {
      prisma.prescription.findUnique.mockResolvedValue({ id: 'rx-1', status: 'CANCELLED', patientId: 'p-1' });
      await expect(service.changeDose('doc-1', input as any)).rejects.toThrow(/Only an active prescription/);
      expect(prescribing.assertCanPrescribe).not.toHaveBeenCalled();
    });

    it('still supersedes the prescription when the notification fails', async () => {
      email.sendConsultationUpdateEmail.mockRejectedValue(new Error('Resend down'));
      await expect(service.changeDose('doc-1', input as any)).resolves.toBeDefined();
    });
  });
});
