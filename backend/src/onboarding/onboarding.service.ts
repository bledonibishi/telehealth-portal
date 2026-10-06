import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PersonaService } from './persona.service';
import { PhotoReviewService } from './photo-review.service';
import { PhotoCheckService } from './photo-check.service';
import { UploadsService } from '../uploads/uploads.service';
import { UploadKind } from '@prisma/client';
import { SaveBodyPhotoInput } from './dto/body-photo.input';
import { OnboardingStatus, OnboardingStepKey } from '../common/enums';
import { SaveIdentityStepInput } from './dto/save-identity-step.input';
import { SaveBodyPhotosStepInput } from './dto/save-body-photos-step.input';
import { SavePrescriptionProofStepInput } from './dto/save-prescription-proof-step.input';
import { ReviewOnboardingStepInput } from './dto/review-onboarding-step.input';

interface StepFeedback {
  step: string;
  approved: boolean;
  reason?: string;
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
    private photoCheck: PhotoCheckService,
    private uploads: UploadsService,
  ) {}

  /** The latest check of each body photo that is currently saved, for the clinician reviewing it. */
  /** The saved body photos that would be turned away at submission, so the app can send the patient back to them. */
  bodyPhotosToRetake(row: { patientId: string; bodyPhotoFrontFileId: string | null; bodyPhotoSideFileId: string | null }) {
    return this.photoCheck.viewsToRetake(row.patientId, { FRONT: row.bodyPhotoFrontFileId, SIDE: row.bodyPhotoSideFileId });
  }

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
        stepFeedback: toJson(stepFeedback.filter((f) => f.step !== OnboardingStepKey.ID_PHOTO)),
      },
    });
    return this.toModel(updated);
  }

  async saveBodyPhotosStep(patientId: string, input: SaveBodyPhotosStepInput) {
    const existing = await this.getOrCreateForPatient(patientId);
    const stepFeedback = existing.stepFeedback as StepFeedback[];
    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        bodyPhotoFrontFileId: input.bodyPhotoFrontFileId,
        bodyPhotoSideFileId: input.bodyPhotoSideFileId,
        stepFeedback: toJson(stepFeedback.filter((f) => f.step !== OnboardingStepKey.BODY_PHOTO)),
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
    const column = input.view === 'FRONT' ? 'bodyPhotoFrontFileId' : 'bodyPhotoSideFileId';
    const previous: string | null = existing[column];
    const stepFeedback = existing.stepFeedback as StepFeedback[];
    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: { [column]: input.fileId, stepFeedback: toJson(stepFeedback.filter((f) => f.step !== OnboardingStepKey.BODY_PHOTO)) },
    });
    if (previous && previous !== input.fileId) {
      const old = await this.prisma.uploadedFile.findUnique({ where: { id: previous } });
      if (old && old.patientId === patientId) await this.uploads.remove(old);
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
        ...(priorMedicationUse ? {} : { prescriptionProofType: null, prescriptionProofFileId: null }),
      },
    });
    return this.toModel(updated);
  }

  async savePrescriptionProofStep(patientId: string, input: SavePrescriptionProofStepInput) {
    const existing = await this.getOrCreateForPatient(patientId);
    const stepFeedback = existing.stepFeedback as StepFeedback[];
    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        prescriptionProofType: input.prescriptionProofType,
        prescriptionProofFileId: input.prescriptionProofFileId,
        stepFeedback: toJson(stepFeedback.filter((f) => f.step !== OnboardingStepKey.PRESCRIPTION_PROOF)),
      },
    });
    return this.toModel(updated);
  }

  async submit(patientId: string) {
    const submission = await this.prisma.onboardingSubmission.findUnique({ where: { patientId } });
    if (!submission) throw new NotFoundException('Onboarding not started');
    if (submission.status !== OnboardingStatus.IN_PROGRESS && submission.status !== OnboardingStatus.REJECTED) {
      throw new BadRequestException('Onboarding has already been submitted');
    }

    const missing: string[] = [];
    if (!submission.idDocumentFileId || !submission.selfieFileId) missing.push('ID photo');
    if (!submission.bodyPhotoFrontFileId || !submission.bodyPhotoSideFileId) missing.push('Full body photo');
    if (submission.priorMedicationUse === null || submission.priorMedicationUse === undefined) {
      missing.push('Prior medication use');
    }
    if (submission.priorMedicationUse && !submission.prescriptionProofFileId) missing.push('Proof of prescription');
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required steps: ${missing.join(', ')}`);
    }
    // A body photo saved before it could be checked (or that the check never passed) is sent back, not sent on.
    const retake = await this.photoCheck.viewsToRetake(patientId, { FRONT: submission.bodyPhotoFrontFileId, SIDE: submission.bodyPhotoSideFileId });
    if (retake.length > 0) {
      throw new BadRequestException(`Please retake your ${retake.map((v) => (v === 'FRONT' ? 'front' : 'side')).join(' and ')} photo — it hasn’t passed the photo check yet`);
    }

    const personaStatus = await this.persona.verifyIdentity(
      patientId,
      submission.idDocumentFileId!,
      submission.selfieFileId!,
    );
    const photoReviewStatus = await this.photoReview.review(
      patientId,
      submission.bodyPhotoFrontFileId!,
      submission.bodyPhotoSideFileId!,
    );

    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        status: OnboardingStatus.PENDING_REVIEW,
        personaStatus,
        photoReviewStatus,
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedByClinicianId: null,
      },
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

  async reviewOnboardingStep(clinicianId: string, input: ReviewOnboardingStepInput) {
    const submission = await this.prisma.onboardingSubmission.findUnique({ where: { patientId: input.patientId } });
    if (!submission) throw new NotFoundException('Onboarding not found');
    if (submission.status !== OnboardingStatus.PENDING_REVIEW) {
      throw new BadRequestException('Onboarding is not pending review');
    }

    const requiredSteps = [OnboardingStepKey.ID_PHOTO, OnboardingStepKey.BODY_PHOTO];
    if (submission.priorMedicationUse) requiredSteps.push(OnboardingStepKey.PRESCRIPTION_PROOF);
    if (!requiredSteps.includes(input.step)) {
      throw new BadRequestException('This step is not part of the current review');
    }
    if (!input.approved && !input.reason?.trim()) {
      throw new BadRequestException('A reason is required when rejecting a step');
    }

    const decisions = (submission.stepFeedback as unknown as StepFeedback[]).filter((d) => d.step !== input.step);
    decisions.push({ step: input.step, approved: input.approved, reason: input.approved ? undefined : input.reason!.trim() });

    const allDecided = requiredSteps.every((step) => decisions.some((d) => d.step === step));
    const anyRejected = decisions.some((d) => requiredSteps.includes(d.step as OnboardingStepKey) && !d.approved);

    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId: input.patientId },
      data: {
        stepFeedback: toJson(decisions),
        ...(allDecided
          ? {
              status: anyRejected ? OnboardingStatus.REJECTED : OnboardingStatus.APPROVED,
              reviewedAt: new Date(),
              reviewedByClinicianId: clinicianId,
            }
          : {}),
      },
    });
    return this.toModel(updated);
  }
}
