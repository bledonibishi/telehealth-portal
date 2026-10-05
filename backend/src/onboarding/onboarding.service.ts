import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PersonaService } from './persona.service';
import { IdentityVerificationService, SUBMITTED_STATUSES } from '../identity-verification/identity-verification.service';
import { requiredReviewSteps } from './required-steps';
import { PhotoReviewService } from './photo-review.service';
import { IdentityVerificationStatus, OnboardingStatus, OnboardingStepKey } from '../common/enums';
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
    private identity: IdentityVerificationService,
  ) {}

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
        idDocumentFileId: input.idDocumentFileId,
        selfieFileId: input.selfieFileId,
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
    if (submission.priorMedicationUse && !submission.prescriptionProofFileId) missing.push('Proof of prescription');
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required steps: ${missing.join(', ')}`);
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

    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        status: OnboardingStatus.PENDING_REVIEW,
        ...(personaStatus ? { personaStatus } : {}),
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

    const identityViaVerifyService = await this.identity.hasVerification(input.patientId);
    const requiredSteps = requiredReviewSteps(submission, identityViaVerifyService);
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

    // Approval also needs the identity check approved. If it is still open the clinician's decisions
    // are saved, and the submission is approved automatically once verify-service approves.
    let finalStatus: OnboardingStatus | null = null;
    if (allDecided && anyRejected) finalStatus = OnboardingStatus.REJECTED;
    else if (allDecided) {
      const identityApproved =
        !identityViaVerifyService || (await this.identity.getStatus(input.patientId)).status === IdentityVerificationStatus.APPROVED;
      if (identityApproved) finalStatus = OnboardingStatus.APPROVED;
    }

    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId: input.patientId },
      data: {
        stepFeedback: toJson(decisions),
        ...(finalStatus
          ? {
              status: finalStatus,
              reviewedAt: new Date(),
              reviewedByClinicianId: clinicianId,
            }
          : {}),
      },
    });
    return this.toModel(updated);
  }
}
