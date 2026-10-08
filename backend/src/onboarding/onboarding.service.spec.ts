import { BadRequestException } from '@nestjs/common';
import { OnboardingStatus, OnboardingStepKey, PersonaStatus, PhotoReviewStatus } from '../common/enums';
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
    // The telehealth consent is on the record unless a test says otherwise.
    consent: { count: jest.fn().mockResolvedValue(1) },
    onboardingSubmission: {
      findUnique: jest.fn().mockResolvedValue({ ...SUBMISSION, ...submission }),
      update: jest.fn().mockResolvedValue({ ...SUBMISSION, ...submission, status: 'PENDING_REVIEW', stepFeedback: [] }),
    },
    $transaction: jest.fn((fn: any) => fn(prisma)),
    $queryRaw: jest.fn().mockResolvedValue([{ locked: 1 }]),
  };
  const persona: any = { verifyIdentity: jest.fn().mockResolvedValue('NOT_CONFIGURED') };
  const photoReview: any = { review: jest.fn().mockResolvedValue('PENDING_REVIEW') };
  const proofReview: any = { reassess: jest.fn().mockResolvedValue(reassessed) };
  const photoCheck: any = { viewsToRetake: jest.fn().mockResolvedValue([]), markSentForReview: jest.fn().mockResolvedValue(undefined) };
  return { service: new OnboardingService(prisma, persona, photoReview, proofReview, photoCheck, {} as any, { isEnabled: false, getStatus: jest.fn(), hasVerification: jest.fn().mockResolvedValue(false), storedStatus: jest.fn().mockResolvedValue(null) } as any), prisma };
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


const submission = (over: Record<string, unknown> = {}) => ({
  id: 's-1', patientId: 'p-1', status: 'IN_PROGRESS', stepFeedback: [{ step: 'BODY_PHOTO', approved: false, reason: 'Too dark' }],
  idDocumentFileId: null, selfieFileId: null, bodyPhotoFrontFileId: null, bodyPhotoSideFileId: null, ...over,
});

function build(row = submission()) {
  const prisma: any = {
    // The telehealth consent is on the record unless a test says otherwise.
    consent: { count: jest.fn().mockResolvedValue(1) },
    onboardingSubmission: {
      findUnique: jest.fn().mockResolvedValue(row),
      create: jest.fn(),
      update: jest.fn(({ data }) => Promise.resolve({ ...row, ...data })),
    },
    uploadedFile: { findUnique: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'new' }]),
    $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
    bodyPhotoCheck: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const uploads: any = { findOwned: jest.fn().mockResolvedValue({ id: 'new', patientId: 'p-1' }), remove: jest.fn() };
  const photoCheck: any = { assertSavable: jest.fn().mockResolvedValue(undefined), viewsToRetake: jest.fn().mockResolvedValue([]), markSentForReview: jest.fn().mockResolvedValue(undefined) };
  const proofReview: any = { reassess: jest.fn().mockResolvedValue(null) };
  const service = new OnboardingService(prisma, {} as any, {} as any, proofReview, photoCheck, uploads, { isEnabled: false, getStatus: jest.fn(), hasVerification: jest.fn().mockResolvedValue(false), storedStatus: jest.fn().mockResolvedValue(null) } as any);
  return { service, prisma, uploads, photoCheck };
}

describe('OnboardingService redo requests', () => {
  const sentBack = { step: 'BODY_PHOTO', approved: false, reason: 'Side photo is blurred', files: ['front', 'side'] };

  it('keeps a step sent back while the patient saves the very same photos again', async () => {
    const { service, prisma } = build(submission({ status: 'REJECTED', bodyPhotoFrontFileId: 'front', bodyPhotoSideFileId: 'side', stepFeedback: [sentBack] }));
    await service.saveBodyPhotosStep('p-1', { bodyPhotoFrontFileId: 'front', bodyPhotoSideFileId: 'side' });
    expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.stepFeedback).toEqual([sentBack]);
  });

  it('clears it once a photo is actually replaced', async () => {
    const { service, prisma } = build(submission({ status: 'REJECTED', bodyPhotoFrontFileId: 'front', bodyPhotoSideFileId: 'side', stepFeedback: [sentBack] }));
    await service.saveBodyPhoto('p-1', { view: 'SIDE' as any, fileId: 'new' });
    expect(prisma.onboardingSubmission.update.mock.calls[0][0].data.stepFeedback).toEqual([]);
  });

  it('does not take the same files again as a redo when the patient sends the application in', async () => {
    const { service, prisma } = setup({ status: 'REJECTED', stepFeedback: [sentBack] }, null);
    await expect(service.submit('p1')).rejects.toThrow(/replace your body photos/);
    expect(prisma.onboardingSubmission.update).not.toHaveBeenCalled();
  });

  it('does not take the application until the consent is on the record (for a patient an admin set up)', async () => {
    const { service, prisma } = setup({ status: 'IN_PROGRESS' }, null);
    prisma.consent.count.mockResolvedValue(0);
    await expect(service.submit('p1')).rejects.toThrow(/accept the consent/);
    expect(prisma.onboardingSubmission.update).not.toHaveBeenCalled();
  });

  it('accepts it once a requested photo is different', async () => {
    const { service } = setup({ status: 'REJECTED', bodyPhotoSideFileId: 'side-2', priorMedicationUse: false, stepFeedback: [sentBack] }, null);
    await expect(service.submit('p1')).resolves.toBeDefined();
  });
});

describe('OnboardingService body photos', () => {
  it('saves one photo as soon as it is checked, clears the old rejection, and leaves the other photo alone', async () => {
    const { service, prisma, uploads, photoCheck } = build();
    await service.saveBodyPhoto('p-1', { view: 'FRONT' as any, fileId: 'new' });
    expect(uploads.findOwned).toHaveBeenCalledWith('p-1', 'new', ['BODY_PHOTO_FRONT']);
    expect(photoCheck.assertSavable).toHaveBeenCalledWith('p-1', 'new', 'FRONT', false);
    expect(prisma.onboardingSubmission.update).toHaveBeenCalledWith({ where: { patientId: 'p-1' }, data: { bodyPhotoFrontFileId: 'new', stepFeedback: [] } });
  });

  it('writes the side photo to the side column, and passes the patient’s ask for a review through', async () => {
    const { service, prisma, photoCheck } = build();
    await service.saveBodyPhoto('p-1', { view: 'SIDE' as any, fileId: 'new', sendForReview: true });
    expect(photoCheck.assertSavable).toHaveBeenCalledWith('p-1', 'new', 'SIDE', true);
    expect(photoCheck.markSentForReview).toHaveBeenCalledWith('p-1', 'new', 'SIDE', expect.anything());
    expect(prisma.onboardingSubmission.update.mock.calls[0][0].data).toHaveProperty('bodyPhotoSideFileId', 'new');
  });

  it('does not save a photo that fails the check rule', async () => {
    const { service, prisma, photoCheck } = build();
    photoCheck.assertSavable.mockRejectedValue(new Error('please retake it'));
    await expect(service.saveBodyPhoto('p-1', { view: 'FRONT' as any, fileId: 'new' })).rejects.toThrow('retake');
    expect(prisma.onboardingSubmission.update).not.toHaveBeenCalled();
  });

  it('the older two-photos-at-once mutation cannot skip the check either', async () => {
    const { service, prisma, photoCheck } = build();
    photoCheck.assertSavable.mockRejectedValueOnce(new Error('This photo didn’t pass the check'));
    await expect(service.saveBodyPhotosStep('p-1', { bodyPhotoFrontFileId: 'f', bodyPhotoSideFileId: 's' })).rejects.toThrow(/didn’t pass/);
    expect(prisma.onboardingSubmission.update).not.toHaveBeenCalled();

    photoCheck.assertSavable.mockResolvedValue(undefined);
    await service.saveBodyPhotosStep('p-1', { bodyPhotoFrontFileId: 'f', bodyPhotoSideFileId: 's' });
    expect(photoCheck.assertSavable).toHaveBeenCalledWith('p-1', 'f', 'FRONT', false);
    expect(photoCheck.assertSavable).toHaveBeenCalledWith('p-1', 's', 'SIDE', false);
    expect(prisma.onboardingSubmission.update).toHaveBeenCalled();
  });

  it('does not record a review request for a photo that simply passed', async () => {
    const { service, photoCheck } = build();
    await service.saveBodyPhoto('p-1', { view: 'FRONT' as any, fileId: 'new' });
    expect(photoCheck.markSentForReview).not.toHaveBeenCalled();
  });

  it('cannot change photos once the application is with a clinician or approved', async () => {
    for (const status of ['PENDING_REVIEW', 'APPROVED']) {
      const { service, prisma, uploads } = build(submission({ status, bodyPhotoFrontFileId: 'old' }));
      await expect(service.saveBodyPhoto('p-1', { view: 'FRONT' as any, fileId: 'new' })).rejects.toThrow(/can’t be changed/);
      await expect(service.saveBodyPhotosStep('p-1', { bodyPhotoFrontFileId: 'f', bodyPhotoSideFileId: 's' })).rejects.toThrow(/can’t be changed/);
      expect(prisma.onboardingSubmission.update).not.toHaveBeenCalled();
      expect(uploads.remove).not.toHaveBeenCalled(); // the photo under review is not deleted
    }
    const { service } = build(submission({ status: 'REJECTED' }));
    await expect(service.saveBodyPhoto('p-1', { view: 'FRONT' as any, fileId: 'new' })).resolves.toBeDefined();
  });

  it('cannot attach a photo the orphan cleanup has just deleted', async () => {
    const { service, prisma } = build();
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.saveBodyPhoto('p-1', { view: 'FRONT' as any, fileId: 'new' })).rejects.toThrow(/not found/i);
    expect(prisma.onboardingSubmission.update).not.toHaveBeenCalled();
  });

  it('still saves the new photo if the old one cannot be deleted (the cleanup finds it later)', async () => {
    const { service, prisma, uploads } = build(submission({ bodyPhotoFrontFileId: 'old' }));
    prisma.uploadedFile.findUnique.mockResolvedValue({ id: 'old', patientId: 'p-1', storageKey: 'k' });
    uploads.remove.mockRejectedValue(new Error('storage down'));
    await expect(service.saveBodyPhoto('p-1', { view: 'FRONT' as any, fileId: 'new' })).resolves.toBeDefined();
  });

  it('deletes the photo it replaces, but only the patient’s own', async () => {
    const { service, prisma, uploads } = build(submission({ bodyPhotoFrontFileId: 'old' }));
    prisma.uploadedFile.findUnique.mockResolvedValue({ id: 'old', patientId: 'p-1', storageKey: 'k' });
    await service.saveBodyPhoto('p-1', { view: 'FRONT' as any, fileId: 'new' });
    expect(uploads.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'old' }));

    uploads.remove.mockClear();
    prisma.uploadedFile.findUnique.mockResolvedValue({ id: 'old', patientId: 'someone-else', storageKey: 'k' });
    await service.saveBodyPhoto('p-1', { view: 'FRONT' as any, fileId: 'new' });
    expect(uploads.remove).not.toHaveBeenCalled();
  });

  it('does not delete anything when the same photo is saved again', async () => {
    const { service, uploads } = build(submission({ bodyPhotoFrontFileId: 'new' }));
    await service.saveBodyPhoto('p-1', { view: 'FRONT' as any, fileId: 'new' });
    expect(uploads.remove).not.toHaveBeenCalled();
  });

  it('discards a retaken photo, but never one that is saved', async () => {
    const { service, uploads } = build(submission({ bodyPhotoFrontFileId: 'kept' }));
    expect(await service.discardBodyPhoto('p-1', 'retaken')).toBe(true);
    expect(uploads.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
    uploads.remove.mockClear();
    uploads.findOwned.mockResolvedValue({ id: 'kept', patientId: 'p-1' });
    expect(await service.discardBodyPhoto('p-1', 'kept')).toBe(false);
    expect(uploads.remove).not.toHaveBeenCalled();
  });

  it('lets either ID photo be saved on its own', async () => {
    const { service, prisma } = build();
    await service.saveIdentityStep('p-1', { selfieFileId: 'selfie-1' });
    const data = prisma.onboardingSubmission.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ selfieFileId: 'selfie-1' });
    expect(data).not.toHaveProperty('idDocumentFileId');
  });

  it('shows a clinician what the check made of each saved photo', async () => {
    const { service, prisma } = build();
    const at = new Date();
    prisma.bodyPhotoCheck.findMany.mockResolvedValue([
      { fileId: 'f', outcome: 'FAIL', issues: ['BAGGY_CLOTHING'], createdAt: at },
      { fileId: 's', outcome: 'PASS', issues: [], createdAt: at },
    ]);
    expect(await service.checksOf({ patientId: 'p-1', bodyPhotoFrontFileId: 'f', bodyPhotoSideFileId: 's' })).toEqual([
      { view: 'FRONT', outcome: 'FAIL', issues: ['BAGGY_CLOTHING'], checkedAt: at },
      { view: 'SIDE', outcome: 'PASS', issues: [], checkedAt: at },
    ]);
    expect(await service.checksOf({ patientId: 'p-1', bodyPhotoFrontFileId: null, bodyPhotoSideFileId: null })).toEqual([]);
  });

  describe('submit', () => {
    const complete = { idDocumentFileId: 'id', selfieFileId: 'se', bodyPhotoFrontFileId: 'f', bodyPhotoSideFileId: 's', priorMedicationUse: false };

    it('sends a patient back to a body photo that never passed the check, instead of accepting the application', async () => {
      const { service, prisma, photoCheck } = build(submission(complete));
      photoCheck.viewsToRetake.mockResolvedValue(['FRONT']);
      await expect(service.submit('p-1')).rejects.toThrow(/retake your front photo/);
      expect(photoCheck.viewsToRetake).toHaveBeenCalledWith('p-1', { FRONT: 'f', SIDE: 's' });
      expect(prisma.onboardingSubmission.update).not.toHaveBeenCalled();
    });

    it('names both photos when both need retaking', async () => {
      const { service, photoCheck } = build(submission(complete));
      photoCheck.viewsToRetake.mockResolvedValue(['FRONT', 'SIDE']);
      await expect(service.submit('p-1')).rejects.toThrow(/front and side photo/);
    });
  });
});

describe('OnboardingService identity handling', () => {
  let prisma: any;
  let persona: { verifyIdentity: jest.Mock };
  let photoReview: { review: jest.Mock };
  let identity: { isEnabled: boolean; getStatus: jest.Mock; hasVerification: jest.Mock; storedStatus: jest.Mock };
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
    prisma = {
      consent: { count: jest.fn().mockResolvedValue(1) },
      onboardingSubmission: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}), create: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ locked: 1 }]),
    };
    persona = { verifyIdentity: jest.fn().mockResolvedValue(PersonaStatus.NOT_CONFIGURED) };
    photoReview = { review: jest.fn().mockResolvedValue(PhotoReviewStatus.PENDING_REVIEW) };
    identity = { isEnabled: false, getStatus: jest.fn().mockResolvedValue({ configured: false, status: null, expiresAt: null }), hasVerification: jest.fn().mockResolvedValue(false), storedStatus: jest.fn() };
    // The stored status is whatever the (mocked) latest check says.
    identity.storedStatus.mockImplementation(async () => (await identity.getStatus('p1'))?.status ?? null);
    // Proof and body-photo checks pass: these tests are about identity.
    const proofReview = { reassess: jest.fn().mockResolvedValue(null) };
    const photoCheck = { viewsToRetake: jest.fn().mockResolvedValue([]) };
    service = new OnboardingService(prisma as any, persona as any, photoReview as any, proofReview as any, photoCheck as any, {} as any, identity as any);
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
      // The flow is stored, so review and approval follow it even if verify-service is turned off.
      expect(data.identityViaVerifyService).toBe(true);
    });

    it('re-checks the identity result under the lock, so a rejection that just landed blocks the submission', async () => {
      identity.getStatus.mockResolvedValue({ configured: true, status: 'NEEDS_REVIEW', expiresAt: null });
      identity.storedStatus.mockResolvedValue('REJECTED');
      await expect(service.submit('p1')).rejects.toThrow('Identity check');
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.onboardingSubmission.update).not.toHaveBeenCalled();
    });

    it('still requires the other steps', async () => {
      identity.getStatus.mockResolvedValue({ configured: true, status: 'APPROVED', expiresAt: null });
      prisma.onboardingSubmission.findUnique.mockResolvedValue(SUBMISSION({ bodyPhotoFrontFileId: null }));
      await expect(service.submit('p1')).rejects.toThrow('Full body photo');
    });
  });
});
