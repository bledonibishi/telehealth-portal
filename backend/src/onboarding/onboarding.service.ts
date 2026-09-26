import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PersonaService } from './persona.service';
import { PhotoReviewService } from './photo-review.service';
import { OnboardingStatus } from '../common/enums';
import { SaveIdentityStepInput } from './dto/save-identity-step.input';
import { SaveBodyPhotosStepInput } from './dto/save-body-photos-step.input';
import { SavePrescriptionProofStepInput } from './dto/save-prescription-proof-step.input';
import { ReviewOnboardingInput } from './dto/review-onboarding.input';

@Injectable()
export class OnboardingService {
  constructor(
    private prisma: PrismaService,
    private persona: PersonaService,
    private photoReview: PhotoReviewService,
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
    await this.getOrCreateForPatient(patientId);
    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        idDocumentFileId: input.idDocumentFileId,
        selfieFileId: input.selfieFileId,
      },
    });
    return this.toModel(updated);
  }

  async saveBodyPhotosStep(patientId: string, input: SaveBodyPhotosStepInput) {
    await this.getOrCreateForPatient(patientId);
    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        bodyPhotoFrontFileId: input.bodyPhotoFrontFileId,
        bodyPhotoSideFileId: input.bodyPhotoSideFileId,
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
    await this.getOrCreateForPatient(patientId);
    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: {
        prescriptionProofType: input.prescriptionProofType,
        prescriptionProofFileId: input.prescriptionProofFileId,
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
        rejectionReason: null,
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

  async review(clinicianId: string, input: ReviewOnboardingInput) {
    const submission = await this.prisma.onboardingSubmission.findUnique({ where: { patientId: input.patientId } });
    if (!submission) throw new NotFoundException('Onboarding not found');
    if (submission.status !== OnboardingStatus.PENDING_REVIEW) {
      throw new BadRequestException('Onboarding is not pending review');
    }
    if (!input.approve && !input.rejectionReason) {
      throw new BadRequestException('rejectionReason is required when rejecting');
    }

    const updated = await this.prisma.onboardingSubmission.update({
      where: { patientId: input.patientId },
      data: {
        status: input.approve ? OnboardingStatus.APPROVED : OnboardingStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedByClinicianId: clinicianId,
        rejectionReason: input.approve ? null : input.rejectionReason,
      },
    });
    return this.toModel(updated);
  }
}
