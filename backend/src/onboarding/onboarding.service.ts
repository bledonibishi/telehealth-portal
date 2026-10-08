import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, UploadKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PersonaService } from './persona.service';
import { IdentityVerificationService, SUBMITTED_STATUSES, lockPatientIdentity } from '../identity-verification/identity-verification.service';
import { requiredReviewSteps, stepFiles, stepLabel, unchangedRedoSteps } from './required-steps';
import { PhotoReviewService } from './photo-review.service';
import { PrescriptionProofReviewService, StoredProofReview } from './prescription-proof-review.service';
import { DoseClarification } from './prior-dose-assessment';
import { PhotoCheckService } from './photo-check.service';
import { UploadsService } from '../uploads/uploads.service';
import { SaveBodyPhotoInput } from './dto/body-photo.input';
import { IdentityVerificationStatus, OnboardingStatus, OnboardingStepKey } from '../common/enums';
import { SaveIdentityStepInput } from './dto/save-identity-step.input';
import { SaveBodyPhotosStepInput } from './dto/save-body-photos-step.input';
import { SavePrescriptionProofStepInput } from './dto/save-prescription-proof-step.input';

const DOSE_CLARIFICATIONS: DoseClarification[] = ['DOCUMENT_CORRECT', 'STEPPED_UP_SINCE', 'STEPPED_DOWN_SINCE', 'NOT_SURE'];

interface StepFeedback {
  step: string;
  approved: boolean;
  reason?: string;
  /** For a step sent back to be redone: what it rested on then, so the same files again aren't taken as a redo. */
  files?: (string | null)[];
}

/**
 * The feedback that is left once a step has been saved again. A step sent back to be redone keeps its feedback
 * while it rests on the very same files; saving something different (or an older entry with no record of
 * the files) clears it, as before.
 */
function feedbackAfterSave(feedback: StepFeedback[], step: OnboardingStepKey, next: Parameters<typeof stepFiles>[0]): StepFeedback[] {
  const now = stepFiles(next, step);
  return feedback.filter(
    (f) => f.step !== step || (Array.isArray(f.files) && f.files.length === now.length && f.files.every((id, i) => id === now[i])),
  );
}

function toJson(feedback: StepFeedback[]): Prisma.InputJsonValue {
  return feedback as unknown as Prisma.InputJsonValue;
}

@Injectable()
export class OnboardingService {
  constructor(
    private prisma: PrismaService,
    private persona: PersonaService,
    private photoReview: PhotoReviewService,
    private proofReview: PrescriptionProofReviewService,
    private photoCheck: PhotoCheckService,
    private uploads: UploadsService,
    private identity: IdentityVerificationService,
  ) {}

  private toReviewModel(row: any) {
    const review = row.prescriptionProofReview as StoredProofReview | null;
    // A review of an earlier upload says nothing about the current one.
    if (!review || review.fileId !== row.prescriptionProofFileId) return null;
    const { assessment, reading } = review;
    return {
      status: review.status,
      reason: review.reason,
      model: review.model,
      riskLevel: assessment.riskLevel,
      patientMessage: assessment.patientMessage,
      findings: assessment.findings,
      // Older stored reviews predate these fields.
      documentIssues: assessment.documentIssues ?? [],
      checks: assessment.checks ?? [],
      reportedMedicine: assessment.reportedMedicineLabel,
      reportedDoseLabel: assessment.reportedDoseLabel,
      reportedLastDose: assessment.reportedLastDoseLabel,
      reportedWeeksOnDose: assessment.reportedWeeksOnDoseLabel,
      doseClarification: review.doseClarification,
      failedAttempts: review.failedAttempts ?? 0,
      nextStep: review.nextStep ?? 'NONE',
      nameEvidenceUrl: review.nameEvidenceFileId ? `/uploads/${review.nameEvidenceFileId}/file` : null,
      nameEvidenceDocumentType: review.nameEvidence?.documentType,
      nameEvidenceNames: review.nameEvidence?.names ?? [],
      requestedDoseLabel: assessment.requestedDoseLabel,
      suggestedDoseLabel: assessment.suggestedDoseLabel,
      nameMatch: assessment.nameMatch,
      patientNameOnDocument: reading?.patientName,
      medicineName: reading?.medicineName,
      doseMg: reading?.doseMg,
      documentDate: reading?.documentDate,
      dateKind: reading?.dateKind,
      notes: reading?.notes,
      reviewedAt: new Date(review.reviewedAt),
    };
  }

  /** The saved body photos that would be turned away at submission, so the app can send the patient back to them. */
  bodyPhotosToRetake(row: { patientId: string; bodyPhotoFrontFileId: string | null; bodyPhotoSideFileId: string | null }) {
    return this.photoCheck.viewsToRetake(row.patientId, { FRONT: row.bodyPhotoFrontFileId, SIDE: row.bodyPhotoSideFileId });
  }

  /** The latest check of each body photo that is currently saved, for the clinician reviewing it. */
  async checksOf(row: { patientId: string; bodyPhotoFrontFileId: string | null; bodyPhotoSideFileId: string | null }) {
    const saved = [row.bodyPhotoFrontFileId, row.bodyPhotoSideFileId].filter((id): id is string => !!id);
    if (!saved.length) return [];
    const rows = await this.prisma.bodyPhotoCheck.findMany({ where: { patientId: row.patientId, fileId: { in: saved } }, orderBy: { createdAt: 'desc' } });
    return (['FRONT', 'SIDE'] as const).flatMap((view) => {
      const latest = rows.find((r) => r.fileId === (view === 'FRONT' ? row.bodyPhotoFrontFileId : row.bodyPhotoSideFileId));
      return latest ? [{ view, outcome: latest.outcome, issues: latest.issues, checkedAt: latest.createdAt }] : [];
    });
  }

  private toModel(row: any) {
    return {
      ...row,
      idDocumentUrl: row.idDocumentFileId ? `/uploads/${row.idDocumentFileId}/file` : null,
      selfieUrl: row.selfieFileId ? `/uploads/${row.selfieFileId}/file` : null,
      bodyPhotoFrontUrl: row.bodyPhotoFrontFileId ? `/uploads/${row.bodyPhotoFrontFileId}/file` : null,
      bodyPhotoSideUrl: row.bodyPhotoSideFileId ? `/uploads/${row.bodyPhotoSideFileId}/file` : null,
      prescriptionProofUrl: row.prescriptionProofFileId ? `/uploads/${row.prescriptionProofFileId}/file` : null,
      prescriptionProofReview: this.toReviewModel(row),
    };
  }

  async getOrCreateForPatient(patientId: string) {
    const existing = await this.prisma.onboardingSubmission.findUnique({ where: { patientId } });
    if (existing) return this.toModel(existing);

    const created = await this.prisma.onboardingSubmission.create({ data: { patientId } });
    return this.toModel(created);
  }

  async saveIdentityStep(patientId: string, input: SaveIdentityStepInput) {
    const existing = await this.getOrCreateForPatient(patientId);
    const stepFeedback = existing.stepFeedback as StepFeedback[];
    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        // Either photo can be saved on its own, so a patient who leaves halfway keeps what they did.
        ...(input.idDocumentFileId && { idDocumentFileId: input.idDocumentFileId }),
        ...(input.selfieFileId && { selfieFileId: input.selfieFileId }),
        stepFeedback: toJson(
          feedbackAfterSave(stepFeedback, OnboardingStepKey.ID_PHOTO, {
            ...existing,
            idDocumentFileId: input.idDocumentFileId || existing.idDocumentFileId,
            selfieFileId: input.selfieFileId || existing.selfieFileId,
          }),
        ),
      },
    });
    return this.toModel(updated);
  }

  /** Photos can change only while the application is the patient's: not while a clinician is looking at it, nor after. */
  private assertEditable(existing: { status: string }) {
    if (existing.status !== OnboardingStatus.IN_PROGRESS && existing.status !== OnboardingStatus.REJECTED) {
      throw new BadRequestException('Your application has been sent to our clinical team, so its photos can’t be changed now');
    }
  }

  /** Both photos at once, for older app versions. They still have to have been checked here and passed. */
  async saveBodyPhotosStep(patientId: string, input: SaveBodyPhotosStepInput) {
    await this.uploads.findOwned(patientId, input.bodyPhotoFrontFileId, [UploadKind.BODY_PHOTO_FRONT]);
    await this.uploads.findOwned(patientId, input.bodyPhotoSideFileId, [UploadKind.BODY_PHOTO_SIDE]);
    await this.photoCheck.assertSavable(patientId, input.bodyPhotoFrontFileId, 'FRONT', false);
    await this.photoCheck.assertSavable(patientId, input.bodyPhotoSideFileId, 'SIDE', false);
    const existing = await this.getOrCreateForPatient(patientId);
    this.assertEditable(existing);
    const stepFeedback = existing.stepFeedback as StepFeedback[];
    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        bodyPhotoFrontFileId: input.bodyPhotoFrontFileId,
        bodyPhotoSideFileId: input.bodyPhotoSideFileId,
        stepFeedback: toJson(
          feedbackAfterSave(stepFeedback, OnboardingStepKey.BODY_PHOTO, {
            ...existing,
            bodyPhotoFrontFileId: input.bodyPhotoFrontFileId,
            bodyPhotoSideFileId: input.bodyPhotoSideFileId,
          }),
        ),
      },
    });
    return this.toModel(updated);
  }

  /**
   * Saves one body photo as soon as it has passed its check, so leaving halfway (back, sign-out, a closed
   * tab) loses nothing. Replacing a photo deletes the old one.
   */
  async saveBodyPhoto(patientId: string, input: SaveBodyPhotoInput) {
    const kind = input.view === 'FRONT' ? UploadKind.BODY_PHOTO_FRONT : UploadKind.BODY_PHOTO_SIDE;
    await this.uploads.findOwned(patientId, input.fileId, [kind]);
    await this.photoCheck.assertSavable(patientId, input.fileId, input.view, !!input.sendForReview);

    const existing = await this.getOrCreateForPatient(patientId);
    this.assertEditable(existing);
    const column = input.view === 'FRONT' ? 'bodyPhotoFrontFileId' : 'bodyPhotoSideFileId';
    const previous: string | null = existing[column];
    const stepFeedback = existing.stepFeedback as StepFeedback[];
    const updated = await this.prisma.$transaction(async (tx) => {
      // The new photo's record is locked while it is attached, the same lock the orphan cleanup takes before it
      // deletes: so the photo is either attached first (and cleanup leaves it) or already gone (and this fails).
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM uploaded_files WHERE id = ${input.fileId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('File not found');
      if (input.sendForReview) await this.photoCheck.markSentForReview(patientId, input.fileId, input.view, tx);
      return tx.onboardingSubmission.update({
        where: { patientId },
        data: {
          [column]: input.fileId,
          stepFeedback: toJson(feedbackAfterSave(stepFeedback, OnboardingStepKey.BODY_PHOTO, { ...existing, [column]: input.fileId })),
        },
      });
    });
    if (previous && previous !== input.fileId) {
      const old = await this.prisma.uploadedFile.findUnique({ where: { id: previous } });
      if (old && old.patientId === patientId) {
        try {
          await this.uploads.remove(old);
        } catch {
          // The new photo is saved; the old one is left unreferenced, and the orphan cleanup removes it later.
        }
      }
    }
    return this.toModel(updated);
  }

  /** A photo that was checked and not kept (a retake): its bytes are deleted. A photo that is saved can't be discarded this way. */
  async discardBodyPhoto(patientId: string, fileId: string): Promise<boolean> {
    const file = await this.uploads.findOwned(patientId, fileId, [UploadKind.BODY_PHOTO_FRONT, UploadKind.BODY_PHOTO_SIDE]);
    const submission = await this.prisma.onboardingSubmission.findUnique({ where: { patientId } });
    if (submission && (submission.bodyPhotoFrontFileId === fileId || submission.bodyPhotoSideFileId === fileId)) return false;
    await this.uploads.remove(file);
    return true;
  }

  async savePriorMedicationUse(patientId: string, priorMedicationUse: boolean) {
    await this.getOrCreateForPatient(patientId);
    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        priorMedicationUse,
        ...(priorMedicationUse
          ? {}
          : { prescriptionProofType: null, prescriptionProofFileId: null, prescriptionProofReview: Prisma.DbNull, prescriptionProofUnavailable: false }),
      },
    });
    return this.toModel(updated);
  }

  async savePrescriptionProofStep(patientId: string, input: SavePrescriptionProofStepInput) {
    const existing = await this.getOrCreateForPatient(patientId);
    const file = await this.prisma.uploadedFile.findUnique({ where: { id: input.prescriptionProofFileId } });
    if (!file || file.patientId !== patientId || file.kind !== UploadKind.PRESCRIPTION_PROOF) {
      throw new BadRequestException('Please upload your proof again');
    }
    const stepFeedback = existing.stepFeedback as StepFeedback[];
    await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        prescriptionProofType: input.prescriptionProofType,
        prescriptionProofFileId: input.prescriptionProofFileId,
        prescriptionProofUnavailable: false,
        // The previous review is kept: it carries the attempt count and any
        // name-change document forward, and is hidden once the file differs.
        stepFeedback: toJson(
          feedbackAfterSave(stepFeedback, OnboardingStepKey.PRESCRIPTION_PROOF, {
            ...existing,
            prescriptionProofFileId: input.prescriptionProofFileId,
            prescriptionProofUnavailable: false,
          }),
        ),
      },
    });
    // Read and assess it now, so the patient sees the outcome before moving
    // on. Takes a few seconds; on any failure it simply goes to manual review.
    await this.proofReview.review(patientId).catch(() => null);
    return this.getOrCreateForPatient(patientId);
  }

  /**
   * The patient used the medicine before but has no proof to upload. The step is done; they'll
   * start on the lowest dose like a new patient unless a clinician verifies their use another way.
   */
  async declarePrescriptionProofUnavailable(patientId: string) {
    const existing = await this.getOrCreateForPatient(patientId);
    if (!existing.priorMedicationUse) throw new BadRequestException('Proof is only needed if you’ve used this medication before');
    const stepFeedback = existing.stepFeedback as StepFeedback[];
    await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        prescriptionProofUnavailable: true,
        stepFeedback: toJson(feedbackAfterSave(stepFeedback, OnboardingStepKey.PRESCRIPTION_PROOF, { ...existing, prescriptionProofUnavailable: true })),
      },
    });
    await this.proofReview.declareUnavailable(patientId).catch(() => null);
    return this.getOrCreateForPatient(patientId);
  }

  /** The patient's answer when the proof's dose differs from the one they gave in the questionnaire. */
  async clarifyPrescriptionDose(patientId: string, choice: string) {
    if (!DOSE_CLARIFICATIONS.includes(choice as DoseClarification)) throw new BadRequestException('Please choose one of the options');
    const review = await this.proofReview.clarifyDose(patientId, choice as DoseClarification);
    if (!review) throw new BadRequestException('Upload your proof of prescription first');
    return this.getOrCreateForPatient(patientId);
  }

  /** A name-change document, for when the name on the proof differs from the account. */
  async savePrescriptionNameEvidence(patientId: string, fileId: string) {
    const existing = await this.getOrCreateForPatient(patientId);
    if (!existing.prescriptionProofFileId) throw new BadRequestException('Upload your proof of prescription first');
    const file = await this.prisma.uploadedFile.findUnique({ where: { id: fileId } });
    if (!file || file.patientId !== patientId || file.kind !== UploadKind.PRESCRIPTION_PROOF) {
      throw new BadRequestException('Please upload your document again');
    }
    await this.proofReview.reviewNameEvidence(patientId, fileId).catch(() => null);
    return this.getOrCreateForPatient(patientId);
  }

  async submit(patientId: string) {
    const submission = await this.prisma.onboardingSubmission.findUnique({ where: { patientId } });
    if (!submission) throw new NotFoundException('Onboarding not started');
    if (submission.status !== OnboardingStatus.IN_PROGRESS && submission.status !== OnboardingStatus.REJECTED) {
      throw new BadRequestException('Onboarding has already been submitted');
    }

    // A step the clinician sent back has to actually be replaced: the same files again is not a redo.
    if (submission.status === OnboardingStatus.REJECTED) {
      const unchanged = unchangedRedoSteps(submission as any);
      if (unchanged.length) {
        throw new BadRequestException(`Please replace your ${unchanged.map(stepLabel).join(' and ')} as your clinician asked before sending it again.`);
      }
    }

    // With verify-service configured the ID check happens there, not through in-app uploads.
    const identityViaVerifyService = this.identity.isEnabled;
    const missing: string[] = [];
    if (identityViaVerifyService) {
      const idv = await this.identity.getStatus(patientId);
      if (!idv.status || !SUBMITTED_STATUSES.includes(idv.status)) missing.push('Identity check');
    } else if (!submission.idDocumentFileId || !submission.selfieFileId) {
      missing.push('ID photo');
    }
    if (!submission.bodyPhotoFrontFileId || !submission.bodyPhotoSideFileId) missing.push('Full body photo');
    if (submission.priorMedicationUse === null || submission.priorMedicationUse === undefined) {
      missing.push('Prior medication use');
    }
    if (submission.priorMedicationUse && !submission.prescriptionProofFileId && !submission.prescriptionProofUnavailable) {
      missing.push('Proof of prescription');
    }
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required steps: ${missing.join(', ')}`);
    }
    // A body photo saved before it could be checked (or that the check never passed) is sent back, not sent on.
    const retake = await this.photoCheck.viewsToRetake(patientId, { FRONT: submission.bodyPhotoFrontFileId, SIDE: submission.bodyPhotoSideFileId });
    if (retake.length > 0) {
      throw new BadRequestException(`Please retake your ${retake.map((v) => (v === 'FRONT' ? 'front' : 'side')).join(' and ')} photo — it hasn’t passed the photo check yet`);
    }

    // The questionnaire may have changed since the proof was read — re-run the
    // dose rules (no model call) so the clinician sees a current assessment.
    if (submission.priorMedicationUse) {
      const review = (await this.proofReview.reassess(patientId).catch(() => null)) ?? (submission.prescriptionProofReview as unknown as StoredProofReview | null);
      // A proof whose details don't match isn't proof: fix it, or carry on without proof (start dose).
      const current = review && review.fileId === submission.prescriptionProofFileId;
      if (!submission.prescriptionProofUnavailable && current && review.nextStep !== 'NONE') {
        throw new BadRequestException(
          'Some details on your proof of prescription don’t match yet. Upload another document, answer the question about your dose, or choose “Continue without proof”.',
        );
      }
    }

    // verify-service keeps personaStatus current itself; only the legacy path computes it here.
    const personaStatus = identityViaVerifyService
      ? undefined
      : await this.persona.verifyIdentity(patientId, submission.idDocumentFileId!, submission.selfieFileId!);
    const photoReviewStatus = await this.photoReview.review(
      patientId,
      submission.bodyPhotoFrontFileId!,
      submission.bodyPhotoSideFileId!,
    );

    // Checked again and written under the identity lock, so a rejection landing meanwhile can't be
    // followed by a submission that rests on it.
    const updated = await this.prisma.$transaction(async (tx) => {
      await lockPatientIdentity(tx, patientId);
      const current = await tx.onboardingSubmission.findUnique({ where: { patientId } });
      if (!current || (current.status !== OnboardingStatus.IN_PROGRESS && current.status !== OnboardingStatus.REJECTED)) {
        throw new BadRequestException('Onboarding has already been submitted');
      }
      if (identityViaVerifyService) {
        const status = await this.identity.storedStatus(tx, patientId);
        if (!status || !SUBMITTED_STATUSES.includes(status)) throw new BadRequestException('Missing required steps: Identity check');
      }
      return tx.onboardingSubmission.update({
        where: { patientId },
        data: {
          status: OnboardingStatus.PENDING_REVIEW,
          // The flow is fixed here: review and approval follow it even if verify-service is turned off later.
          identityViaVerifyService,
          ...(personaStatus ? { personaStatus } : {}),
          photoReviewStatus,
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedByClinicianId: null,
        },
      });
    });
    return this.toModel(updated);
  }

  async findQueue() {
    const rows = await this.prisma.onboardingSubmission.findMany({
      where: { status: OnboardingStatus.PENDING_REVIEW },
      include: { patient: true },
      orderBy: { submittedAt: 'asc' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByPatientId(patientId: string) {
    const row = await this.prisma.onboardingSubmission.findUnique({
      where: { patientId },
      include: { patient: true },
    });
    // Null, not a 404 — a clinician can open any patient, most of whom
    // haven't started onboarding yet.
    return row ? this.toModel(row) : null;
  }
}
