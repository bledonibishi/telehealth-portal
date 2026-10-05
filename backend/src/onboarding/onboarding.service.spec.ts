import { BadRequestException } from '@nestjs/common';
import { OnboardingStatus, OnboardingStepKey, PersonaStatus, PhotoReviewStatus } from '../common/enums';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService identity handling', () => {
  let prisma: { onboardingSubmission: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock } };
  let persona: { verifyIdentity: jest.Mock };
  let photoReview: { review: jest.Mock };
  let identity: { isEnabled: boolean; getStatus: jest.Mock; hasVerification: jest.Mock };
  let service: OnboardingService;

  const SUBMISSION = (over: Record<string, unknown> = {}) => ({
    id: 'o1',
    patientId: 'p1',
    status: OnboardingStatus.IN_PROGRESS,
    idDocumentFileId: null,
    selfieFileId: null,
    bodyPhotoFrontFileId: 'f',
    bodyPhotoSideFileId: 's',
    priorMedicationUse: false,
    prescriptionProofFileId: null,
    personaStatus: PersonaStatus.NOT_STARTED,
    stepFeedback: [],
    ...over,
  });

  beforeEach(() => {
    prisma = { onboardingSubmission: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}), create: jest.fn() } };
    persona = { verifyIdentity: jest.fn().mockResolvedValue(PersonaStatus.NOT_CONFIGURED) };
    photoReview = { review: jest.fn().mockResolvedValue(PhotoReviewStatus.PENDING_REVIEW) };
    identity = { isEnabled: false, getStatus: jest.fn(), hasVerification: jest.fn().mockResolvedValue(false) };
    service = new OnboardingService(prisma as any, persona as any, photoReview as any, identity as any);
  });

  describe('submit without verify-service (existing behaviour)', () => {
    it('still needs the in-app ID photo and selfie, and runs the legacy check', async () => {
      prisma.onboardingSubmission.findUnique.mockResolvedValue(SUBMISSION());
      await expect(service.submit('p1')).rejects.toThrow('ID photo');

      prisma.onboardingSubmission.findUnique.mockResolvedValue(SUBMISSION({ idDocumentFileId: 'id', selfieFileId: 'se' }));
      await service.submit('p1');
      expect(persona.verifyIdentity).toHaveBeenCalledWith('p1', 'id', 'se');
      expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.personaStatus).toBe(PersonaStatus.NOT_CONFIGURED);
    });
  });

  describe('submit with verify-service', () => {
    beforeEach(() => {
      identity.isEnabled = true;
      prisma.onboardingSubmission.findUnique.mockResolvedValue(SUBMISSION());
    });

    it.each([
      ['no check started', null],
      ['link created but no photos sent', 'PENDING'],
      ['link expired', 'EXPIRED'],
      ['rejected', 'REJECTED'],
    ])('does not let the patient submit with an incomplete identity check (%s)', async (_label, status) => {
      identity.getStatus.mockResolvedValue({ configured: true, status, expiresAt: null });
      await expect(service.submit('p1')).rejects.toThrow('Identity check');
      expect(prisma.onboardingSubmission.update).not.toHaveBeenCalled();
    });

    it.each(['PROCESSING', 'NEEDS_REVIEW', 'APPROVED'])('accepts a submission once the check is %s', async (status) => {
      identity.getStatus.mockResolvedValue({ configured: true, status, expiresAt: null });
      await service.submit('p1');
      expect(prisma.onboardingSubmission.update).toHaveBeenCalled();
    });

    it('needs no in-app ID photo, skips the legacy check and keeps the status verify-service set', async () => {
      identity.getStatus.mockResolvedValue({ configured: true, status: 'NEEDS_REVIEW', expiresAt: null });
      await service.submit('p1');
      expect(persona.verifyIdentity).not.toHaveBeenCalled();
      const data = prisma.onboardingSubmission.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('personaStatus');
      expect(data.status).toBe(OnboardingStatus.PENDING_REVIEW);
    });

    it('still requires the other steps', async () => {
      identity.getStatus.mockResolvedValue({ configured: true, status: 'APPROVED', expiresAt: null });
      prisma.onboardingSubmission.findUnique.mockResolvedValue(SUBMISSION({ bodyPhotoFrontFileId: null }));
      await expect(service.submit('p1')).rejects.toThrow('Full body photo');
    });
  });

  describe('clinician review', () => {
    const review = (step: OnboardingStepKey, approved = true) =>
      service.reviewOnboardingStep('c1', { patientId: 'p1', step, approved, reason: approved ? undefined : 'blurry' } as any);

    beforeEach(() => {
      prisma.onboardingSubmission.findUnique.mockResolvedValue(SUBMISSION({ status: OnboardingStatus.PENDING_REVIEW }));
    });

    describe('legacy flow (no verify-service session)', () => {
      it('still reviews the ID photo and approves once both steps are approved', async () => {
        prisma.onboardingSubmission.findUnique.mockResolvedValue(
          SUBMISSION({
            status: OnboardingStatus.PENDING_REVIEW,
            stepFeedback: [{ step: OnboardingStepKey.BODY_PHOTO, approved: true }],
          }),
        );
        await review(OnboardingStepKey.ID_PHOTO);
        expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.status).toBe(OnboardingStatus.APPROVED);
        expect(identity.getStatus).not.toHaveBeenCalled();
      });
    });

    describe('identity checked in verify-service', () => {
      beforeEach(() => {
        identity.hasVerification.mockResolvedValue(true);
      });

      it('no longer accepts a review of the ID photo, which never reaches this app', async () => {
        await expect(review(OnboardingStepKey.ID_PHOTO)).rejects.toBeInstanceOf(BadRequestException);
      });

      it('approves when the body photo is approved and identity is approved', async () => {
        identity.getStatus.mockResolvedValue({ configured: true, status: 'APPROVED', expiresAt: null });
        await review(OnboardingStepKey.BODY_PHOTO);
        const data = prisma.onboardingSubmission.update.mock.calls[0][0].data;
        expect(data.status).toBe(OnboardingStatus.APPROVED);
        expect(data.reviewedByClinicianId).toBe('c1');
      });

      it.each(['PENDING', 'PROCESSING', 'NEEDS_REVIEW', 'EXPIRED', 'REJECTED'])(
        'saves the decision but does not approve while identity is %s',
        async (status) => {
          identity.getStatus.mockResolvedValue({ configured: true, status, expiresAt: null });
          await review(OnboardingStepKey.BODY_PHOTO);
          const data = prisma.onboardingSubmission.update.mock.calls[0][0].data;
          expect(data.stepFeedback).toEqual([{ step: OnboardingStepKey.BODY_PHOTO, approved: true, reason: undefined }]);
          expect(data.status).toBeUndefined();
        },
      );

      it('rejects the onboarding when the clinician rejects a step, whatever the identity result', async () => {
        identity.getStatus.mockResolvedValue({ configured: true, status: 'NEEDS_REVIEW', expiresAt: null });
        await review(OnboardingStepKey.BODY_PHOTO, false);
        expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.status).toBe(OnboardingStatus.REJECTED);
      });

      it('also needs the prescription proof decision when prior medication was used', async () => {
        identity.getStatus.mockResolvedValue({ configured: true, status: 'APPROVED', expiresAt: null });
        prisma.onboardingSubmission.findUnique.mockResolvedValue(
          SUBMISSION({ status: OnboardingStatus.PENDING_REVIEW, priorMedicationUse: true }),
        );
        await review(OnboardingStepKey.BODY_PHOTO);
        expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.status).toBeUndefined();
      });
    });
  });
});
