import { OnboardingService } from './onboarding.service';

const SUBMISSION = {
  patientId: 'p1',
  status: 'IN_PROGRESS',
  idDocumentFileId: 'id',
  selfieFileId: 'selfie',
  bodyPhotoFrontFileId: 'front',
  bodyPhotoSideFileId: 'side',
  priorMedicationUse: true,
  prescriptionProofFileId: 'proof-1',
  prescriptionProofUnavailable: false,
  prescriptionProofReview: null,
};

function setup(submission: Record<string, unknown>, reassessed: unknown) {
  const prisma: any = {
    onboardingSubmission: {
      findUnique: jest.fn().mockResolvedValue({ ...SUBMISSION, ...submission }),
      update: jest.fn().mockResolvedValue({ ...SUBMISSION, ...submission, status: 'PENDING_REVIEW', stepFeedback: [] }),
    },
  };
  const persona: any = { verifyIdentity: jest.fn().mockResolvedValue('NOT_CONFIGURED') };
  const photoReview: any = { review: jest.fn().mockResolvedValue('PENDING_REVIEW') };
  const proofReview: any = { reassess: jest.fn().mockResolvedValue(reassessed) };
  return { service: new OnboardingService(prisma, persona, photoReview, proofReview), prisma };
}

describe('OnboardingService.submit with prescription proof', () => {
  const review = (nextStep: string, fileId = 'proof-1') => ({ fileId, nextStep });

  it('refuses while the proof still has details that don’t match', async () => {
    const { service, prisma } = setup({}, review('REUPLOAD'));
    await expect(service.submit('p1')).rejects.toThrow(/don’t match yet/);
    expect(prisma.onboardingSubmission.update).not.toHaveBeenCalled();
  });

  it('refuses after the second failed upload too (they can message the team or continue without proof)', async () => {
    const { service } = setup({}, review('CONTACT_US'));
    await expect(service.submit('p1')).rejects.toThrow(/Continue without proof/);
  });

  it('submits once the proof matches', async () => {
    const { service, prisma } = setup({}, review('NONE'));
    await service.submit('p1');
    expect(prisma.onboardingSubmission.update).toHaveBeenCalled();
  });

  it('submits when the patient chose to continue without proof', async () => {
    const { service, prisma } = setup({ prescriptionProofUnavailable: true }, null);
    await service.submit('p1');
    expect(prisma.onboardingSubmission.update).toHaveBeenCalled();
  });

  it('submits when the proof couldn’t be checked automatically (a clinician reviews it)', async () => {
    const { service, prisma } = setup({ prescriptionProofReview: null }, null);
    await service.submit('p1');
    expect(prisma.onboardingSubmission.update).toHaveBeenCalled();
  });
});
