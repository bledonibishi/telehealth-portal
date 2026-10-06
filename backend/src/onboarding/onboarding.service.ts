import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, UploadKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PersonaService } from './persona.service';
import { PhotoReviewService } from './photo-review.service';
import { PrescriptionProofReviewService, StoredProofReview } from './prescription-proof-review.service';
import { DoseClarification } from './prior-dose-assessment';

const DOSE_CLARIFICATIONS: DoseClarification[] = ['DOCUMENT_CORRECT', 'STEPPED_UP_SINCE', 'STEPPED_DOWN_SINCE', 'NOT_SURE'];
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
    private proofReview: PrescriptionProofReviewService,
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
        stepFeedback: toJson(stepFeedback.filter((f) => f.step !== OnboardingStepKey.PRESCRIPTION_PROOF)),
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
        stepFeedback: toJson(stepFeedback.filter((f) => f.step !== OnboardingStepKey.PRESCRIPTION_PROOF)),
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

    const missing: string[] = [];
    if (!submission.idDocumentFileId || !submission.selfieFileId) missing.push('ID photo');
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
