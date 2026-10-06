import { ForbiddenException } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { ConsultationStatus } from '../common/enums';

const PATIENT = { id: 'patient-1', email: 'p@example.com', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' };
const CONSULTATION = { id: 'consult-1', patientId: PATIENT.id, kind: 'HRT', status: ConsultationStatus.SUBMITTED, patient: PATIENT };
const VERIFIED_DOCTOR = { id: 'doc-1', isVerified: true, licenseNumber: 'KS-1', mfaEnabled: true };

describe('ConsultationsService', () => {
  let prisma: any;
  let billing: { cancelAndRefund: jest.Mock };
  let config: { get: jest.Mock };
  let prescribing: { issue: jest.Mock; assertCanPrescribe: jest.Mock; assertIdentityVerified: jest.Mock };
  let messaging: { send: jest.Mock };
  let email: { sendConsultationUpdateEmail: jest.Mock };
  let consents: { record: jest.Mock };
  let audit: { log: jest.Mock };
  let proofReview: { reassess: jest.Mock };
  let service: ConsultationsService;

  beforeEach(() => {
    prisma = {
      consultation: {
        findUnique: jest.fn().mockResolvedValue(CONSULTATION),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...CONSULTATION, ...data })),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'new-1', status: 'SUBMITTED', kind: data.kind, redFlags: data.redFlags.create })),
      },
      patient: { findUnique: jest.fn().mockResolvedValue({ ...PATIENT, lead: null }) },
      message: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn().mockResolvedValue([]) },
      clinician: { findUnique: jest.fn().mockResolvedValue(VERIFIED_DOCTOR) },
      onboardingSubmission: { findUnique: jest.fn().mockResolvedValue({ status: 'APPROVED' }), upsert: jest.fn() },
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
    };
    prescribing = {
      issue: jest.fn().mockResolvedValue({ id: 'rx-1', medication: 'Estradiol', dosage: '0.06% × 1', contentHash: 'abc' }),
      assertCanPrescribe: jest.fn(),
      assertIdentityVerified: jest.fn(),
    };
    billing = { cancelAndRefund: jest.fn().mockResolvedValue({ status: 'REFUNDED', subscriptionId: 'sub_1', refundId: 're_1' }) };
    config = { get: jest.fn((_key: string, fallback: string) => fallback) };
    messaging = { send: jest.fn() };
    email = { sendConsultationUpdateEmail: jest.fn() };
    consents = { record: jest.fn() };
    audit = { log: jest.fn() };
    proofReview = { reassess: jest.fn().mockResolvedValue(null) };
    service = new ConsultationsService(
      prisma,
      audit as any,
      { capture: jest.fn() } as any,
      { info: jest.fn() } as any,
      billing as any,
      config as any,
      prescribing as any,
      messaging as any,
      email as any,
      consents as any,
      { trySendForPrescription: jest.fn() } as any,
      proofReview as any,
      { priceIdFor: jest.fn().mockReturnValue(null) } as any,
    );
  });

  const approveInput = {
    consultationId: 'consult-1',
    items: [{ productId: 'prod-1', strengthId: 'str-1', quantity: 1, directions: 'Two pumps daily' }],
  };

  describe('approve', () => {
    it('approves when the prescriber is verified with MFA and the patient is onboarded', async () => {
      const result = await service.approve('doc-1', approveInput);
      expect(prisma.consultation.update).toHaveBeenCalled();
      expect(result.prescription.id).toBe('rx-1');
    });

    it('issues the prescription in the same transaction, for this consultation and prescriber', async () => {
      await service.approve('doc-1', approveInput);
      expect(prescribing.issue).toHaveBeenCalledWith(
        expect.objectContaining({
          consultationId: 'consult-1',
          patientId: PATIENT.id,
          prescriberId: 'doc-1',
          kind: 'HRT',
          items: approveInput.items,
        }),
        prisma,
      );
    });

    it('records the approval against the patient, in the same transaction as the decision', async () => {
      await service.approve('doc-1', approveInput);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONSULTATION_APPROVED',
          actorId: 'doc-1',
          resourceId: 'consult-1',
          patientId: PATIENT.id,
          metadata: expect.objectContaining({ prescriptionId: 'rx-1', contentHash: 'abc' }),
        }),
        prisma,
      );
    });

    it('fails the approval when the audit row cannot be written', async () => {
      audit.log.mockRejectedValue(new Error('Audit log write failed'));
      await expect(service.approve('doc-1', approveInput)).rejects.toThrow('Audit log write failed');
    });

    it('does not approve when the prescription is rejected', async () => {
      prescribing.issue.mockRejectedValue(new Error('Record a clinical reason'));
      await expect(service.approve('doc-1', approveInput)).rejects.toThrow('Record a clinical reason');
      expect(prisma.consultation.update).not.toHaveBeenCalled();
    });

    it('checks the prescriber and the patient’s identity before issuing', async () => {
      await service.approve('doc-1', approveInput);
      expect(prescribing.assertCanPrescribe).toHaveBeenCalledWith('doc-1');
      expect(prescribing.assertIdentityVerified).toHaveBeenCalledWith(PATIENT.id);
    });

    it('does not approve when the prescriber check fails', async () => {
      prescribing.assertCanPrescribe.mockRejectedValue(new ForbiddenException('licence'));
      await expect(service.approve('doc-1', approveInput)).rejects.toThrow('licence');
      expect(prescribing.issue).not.toHaveBeenCalled();
      expect(prisma.consultation.update).not.toHaveBeenCalled();
    });
  });

  describe('findQueue', () => {
    it('puts RED first, then ORANGE, then GREEN, keeping the longest wait first within a tag', async () => {
      const row = (id: string, ...severities: string[]) => ({ id, redFlags: severities.map((severity) => ({ severity, description: id })) });
      prisma.consultation.findMany = jest.fn().mockResolvedValue([
        row('green-old'), row('orange-old', 'WARNING'), row('red-new', 'WARNING', 'CRITICAL'), row('green-new'), row('red-newest', 'CRITICAL'),
      ]);
      const queue = await service.findQueue();
      expect(queue.map((c: any) => c.id)).toEqual(['red-new', 'red-newest', 'orange-old', 'green-old', 'green-new']);
    });
  });

  describe('decline', () => {
    it('refunds and records the reason when nothing else is prescribed', async () => {
      await service.decline('doc-1', { consultationId: 'consult-1', reason: 'Contraindicated' });

      expect(billing.cancelAndRefund).toHaveBeenCalledWith(PATIENT);
      expect(prisma.consultation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ declineReason: 'Contraindicated', refundStatus: 'REFUNDED' }),
        }),
      );
    });

    it('records the decline with its reason and refund against the patient', async () => {
      await service.decline('doc-1', { consultationId: 'consult-1', reason: 'Contraindicated' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONSULTATION_DECLINED',
          patientId: PATIENT.id,
          metadata: expect.objectContaining({ reason: 'Contraindicated' }),
        }),
        prisma,
      );
    });

    it('does not touch billing when the patient has another approved consultation', async () => {
      prisma.consultation.count.mockResolvedValue(1);
      await service.decline('doc-1', { consultationId: 'consult-1', reason: 'Not suitable' });

      expect(billing.cancelAndRefund).not.toHaveBeenCalled();
      expect(prisma.consultation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ refundStatus: 'NOT_REQUIRED' }) }),
      );
    });

    it('still declines, flagged FAILED, when the refund fails', async () => {
      billing.cancelAndRefund.mockResolvedValue({ status: 'FAILED', error: 'card_declined' });
      await service.decline('doc-1', { consultationId: 'consult-1', reason: 'Not suitable' });

      expect(prisma.consultation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DECLINED', refundStatus: 'FAILED' }) }),
      );
    });
  });

  describe('submitIntakeQuiz', () => {
    const answer = (questionId: string, value: string) => ({ questionId, answer: value, value });
    const glp1Intake = (over: Record<string, string> = {}) =>
      Object.entries({
        height_cm: '170', weight_kg: '95', bp_known: 'yes', bp_systolic: '120', bp_diastolic: '80', smoking: 'never',
        current_medications: 'None', allergies: 'None', glp1_prior_use: 'no',
        diabetes_medicines: 'none', eating_disorder: 'no', gallbladder: 'no',
        kidney_disease: 'no', bariatric_surgery: 'no', ...over,
      }).map(([k, v]) => answer(k, v));

    it('rejects an incomplete questionnaire without creating anything', async () => {
      await expect(
        service.submitIntakeQuiz('patient-1', { kind: 'GLP1' as any, answers: glp1Intake().slice(1) }),
      ).rejects.toThrow(/height/);
      expect(prisma.consultation.create).not.toHaveBeenCalled();
    });

    it('a GLP-1 “no” to prior use marks the proof step as not needed', async () => {
      await service.submitIntakeQuiz('patient-1', { kind: 'GLP1' as any, answers: glp1Intake() });
      expect(prisma.onboardingSubmission.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ priorMedicationUse: false, prescriptionProofFileId: null }) }),
      );
      expect(proofReview.reassess).not.toHaveBeenCalled();
    });

    it('a GLP-1 “yes” requires proof and re-checks any proof already uploaded against the answers', async () => {
      await service.submitIntakeQuiz('patient-1', {
        kind: 'GLP1' as any,
        answers: glp1Intake({ glp1_prior_use: 'yes', glp1_prior_medicine: 'mounjaro', glp1_prior_dose_tirzepatide: '5 mg', glp1_last_dose: 'under_1_week', glp1_weeks_on_dose: '4_plus_weeks' }),
      });
      expect(prisma.onboardingSubmission.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { priorMedicationUse: true } }));
      expect(proofReview.reassess).toHaveBeenCalledWith('patient-1');
    });

    it('creates the consultation even with critical answers, as red flags', async () => {
      await service.submitIntakeQuiz('patient-1', { kind: 'GLP1' as any, answers: glp1Intake({ eating_disorder: 'yes' }) });

      const { data } = prisma.consultation.create.mock.calls[0][0];
      expect(data.questionnaireVersion).toBe('GLP1-intake@2');
      expect(data.redFlags.create).toEqual(
        expect.arrayContaining([{ severity: 'CRITICAL', description: 'History of eating disorder' }]),
      );
    });

    it('re-checks the eligibility answers stored on the lead', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        ...PATIENT,
        lead: {
          productKind: 'GLP1',
          quizAnswers: [
            { questionId: 'medical_history', question: '…', answer: 'Pancreatitis' },
            { questionId: 'preferred_medication', question: 'Preferred medicine', answer: 'Wegovy' },
          ],
        },
      });
      await service.submitIntakeQuiz('patient-1', { kind: 'GLP1' as any, answers: glp1Intake() });

      const { data } = prisma.consultation.create.mock.calls[0][0];
      expect(data.redFlags.create).toEqual([{ severity: 'CRITICAL', description: 'History of pancreatitis' }]);
      expect(data.quizAnswers.map((a: any) => a.questionId)).toEqual(
        expect.arrayContaining(['medical_history', 'preferred_medication', 'height_cm', 'bmi_calculated']),
      );
    });

    it('records telehealth consent with the request details', async () => {
      await service.submitIntakeQuiz(
        'patient-1',
        { kind: 'GLP1' as any, answers: glp1Intake(), telehealthConsentVersion: '2026-09-29' },
        { ip: '1.2.3.4', userAgent: 'test' },
      );
      expect(consents.record).toHaveBeenCalledWith('patient-1', 'TELEHEALTH', '2026-09-29', { ip: '1.2.3.4', userAgent: 'test' });
    });

    it('creates nothing when consent is refused', async () => {
      consents.record.mockRejectedValue(new Error('Please read and accept the consent statement'));
      await expect(service.submitIntakeQuiz('patient-1', { kind: 'GLP1' as any, answers: glp1Intake() })).rejects.toThrow(/consent/);
      expect(prisma.consultation.create).not.toHaveBeenCalled();
    });

    it('refuses a fresh consultation after a declined, refunded one', async () => {
      prisma.consultation.count.mockResolvedValue(1);
      await expect(
        service.submitIntakeQuiz('patient-1', { kind: 'GLP1' as any, answers: glp1Intake() }),
      ).rejects.toThrow(/declined and refunded/);
      expect(prisma.consultation.create).not.toHaveBeenCalled();
      expect(consents.record).not.toHaveBeenCalled();
    });

    it('refuses a second consultation while one is under review', async () => {
      prisma.consultation.findFirst.mockResolvedValue({ id: 'open-1', status: 'SUBMITTED' });
      await expect(
        service.submitIntakeQuiz('patient-1', { kind: 'GLP1' as any, answers: glp1Intake() }),
      ).rejects.toThrow(/already with our clinical team/);
    });

    it('answers a request for more information by updating the open consultation', async () => {
      prisma.consultation.findFirst.mockResolvedValue({ id: 'open-1', status: 'MORE_INFO_REQUESTED' });
      prisma.consultation.update.mockResolvedValue({ id: 'open-1', status: 'SUBMITTED', kind: 'GLP1', redFlags: [] });

      await service.submitIntakeQuiz('patient-1', { kind: 'GLP1' as any, answers: glp1Intake() });

      expect(prisma.consultation.create).not.toHaveBeenCalled();
      expect(prisma.consultation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'open-1' },
          data: expect.objectContaining({ status: 'SUBMITTED', redFlags: { deleteMany: {}, create: [] } }),
        }),
      );
    });
  });

  describe('claiming', () => {
    const claimedBy = (id: string) => ({ ...CONSULTATION, status: 'IN_REVIEW', clinicianId: id, clinician: { firstName: 'Ana', lastName: 'Berisha' } });

    it('claims a new consultation with a conditional update', async () => {
      await service.claim('doc-1', 'consult-1');
      expect(prisma.consultation.updateMany).toHaveBeenCalledWith({
        where: { id: 'consult-1', OR: [{ status: 'SUBMITTED' }] },
        data: { status: 'IN_REVIEW', clinicianId: 'doc-1' },
      });
    });

    it('reports a lost race', async () => {
      prisma.consultation.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.claim('doc-1', 'consult-1')).rejects.toThrow(/just claimed/);
    });

    it("blocks other doctors' decisions on a claimed consultation", async () => {
      prisma.consultation.findUnique.mockResolvedValue(claimedBy('doc-2'));
      await expect(service.claim('doc-1', 'consult-1')).rejects.toThrow('being reviewed by Dr Berisha');
      await expect(service.decline('doc-1', { consultationId: 'consult-1', reason: 'x' })).rejects.toThrow('Dr Berisha');
      await expect(service.requestMoreInfo('doc-1', 'consult-1')).rejects.toThrow('Dr Berisha');
      expect(billing.cancelAndRefund).not.toHaveBeenCalled();
    });

    it('lets the claiming doctor, or an admin, decide', async () => {
      prisma.consultation.findUnique.mockResolvedValue(claimedBy('doc-2'));
      await service.decline('doc-2', { consultationId: 'consult-1', reason: 'x' });
      await service.decline('admin-1', { consultationId: 'consult-1', reason: 'x' }, true);
      expect(prisma.consultation.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('patient notifications', () => {
    it('messages the patient and sends a generic email when asking for more info', async () => {
      await service.requestMoreInfo('doc-1', 'consult-1', 'Please send a recent BP reading');
      expect(messaging.send).toHaveBeenCalledWith('doc-1', 'CLINICIAN', {
        consultationId: 'consult-1',
        content: 'Please send a recent BP reading',
      });
      expect(email.sendConsultationUpdateEmail).toHaveBeenCalledWith(
        PATIENT.email, undefined, 'Your clinician has a question', 'http://localhost:3000/dashboard',
      );
    });

    it('still records the decision when the email fails', async () => {
      email.sendConsultationUpdateEmail.mockRejectedValue(new Error('Resend down'));
      await expect(service.decline('doc-1', { consultationId: 'consult-1', reason: 'x' })).resolves.toBeDefined();
    });
  });
});
