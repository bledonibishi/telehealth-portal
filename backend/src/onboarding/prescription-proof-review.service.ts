import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { ConsultationKind, RedFlagSeverity } from '../common/enums';
import { findGlp1Dose, orderedTreatmentText } from '../catalog/ordered-dose';
import { ProofReaderService } from './proof-reader.service';
import {
  Assessment,
  assessPriorDose,
  DocumentReading,
  DoseClarification,
  MEDICINE_LABEL,
  Molecule,
  NameEvidenceReading,
  PRIOR_DOSE_RULES,
  RequestedDose,
  ReportedPriorUse,
} from './prior-dose-assessment';

export type ProofReviewStatus = 'COMPLETED' | 'NOT_CONFIGURED' | 'UNSUPPORTED_FILE' | 'FAILED';

// What the patient is offered when the document has issues: upload again
// (with advice per issue), and once that hasn't worked, message the team.
export type ProofNextStep = 'NONE' | 'REUPLOAD' | 'CONTACT_US';
export const MAX_SELF_SERVICE_ATTEMPTS = 2;

/** Stored on OnboardingSubmission.prescriptionProofReview. */
export interface StoredProofReview {
  status: ProofReviewStatus;
  reason?: string;
  model?: string;
  reading: DocumentReading | null;
  assessment: Assessment;
  // The file this review is for — a new upload makes the review stale.
  fileId: string;
  // A name-change document, kept across proof re-uploads.
  nameEvidenceFileId?: string | null;
  nameEvidence?: NameEvidenceReading | null;
  // The patient's answer when this document's dose differs from their questionnaire answer.
  doseClarification?: DoseClarification | null;
  // Checks that came back with document issues, across all uploads.
  failedAttempts: number;
  nextStep: ProofNextStep;
  reviewedAt: string;
}

export interface ProofRequirements {
  name: string | null;
  medicine: string | null;
  dose: string | null;
  // YYYY-MM-DD: the oldest dispensing, prescribing or order date that still counts.
  notBefore: string;
}

type ReviewInputs = Omit<StoredProofReview, 'assessment' | 'reviewedAt' | 'failedAttempts' | 'nextStep'>;

// Red flags this service adds to the consultation start with this, so a re-run
// can replace its own without touching flags from the questionnaire.
const FLAG_PREFIX = 'Prescription proof: ';

const MOLECULE_OF_SLUG: Record<string, Molecule> = {
  'tirzepatide-mounjaro': 'tirzepatide',
  'semaglutide-wegovy': 'semaglutide',
  'semaglutide-ozempic': 'semaglutide',
};

@Injectable()
export class PrescriptionProofReviewService {
  private readonly logger = new Logger(PrescriptionProofReviewService.name);

  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
    private reader: ProofReaderService,
  ) {}

  /** Reads the uploaded proof with the model and assesses it. Never throws — a failure means manual review. */
  async review(patientId: string): Promise<StoredProofReview | null> {
    const submission = await this.prisma.onboardingSubmission.findUnique({ where: { patientId } });
    const fileId = submission?.prescriptionProofFileId;
    if (!fileId) return null;
    // The previous review, if any — possibly of an earlier upload.
    const previous = submission.prescriptionProofReview as unknown as StoredProofReview | null;

    let outcome: Awaited<ReturnType<ProofReaderService['read']>>;
    try {
      const file = await this.prisma.uploadedFile.findUnique({ where: { id: fileId } });
      if (!file || file.patientId !== patientId) {
        outcome = { status: 'FAILED', reason: 'Proof file not found for this patient' };
      } else {
        outcome = await this.reader.read(await this.uploads.readContents(file), file.mimeType);
      }
    } catch (err) {
      this.logger.error(`Could not load prescription proof for ${patientId}: ${(err as Error).message}`);
      outcome = { status: 'FAILED', reason: 'Could not load the file' };
    }

    const reading = outcome.status === 'COMPLETED' ? outcome.reading : null;
    return this.store(
      patientId,
      {
        status: outcome.status,
        reason: outcome.status === 'COMPLETED' ? undefined : outcome.reason,
        model: outcome.status === 'COMPLETED' ? this.reader.model : undefined,
        reading,
        fileId,
        nameEvidenceFileId: previous?.nameEvidenceFileId ?? null,
        nameEvidence: previous?.nameEvidence ?? null,
        // Not carried over: it was about the previous document's dose.
        doseClarification: null,
      },
      { previousFailedAttempts: previous?.failedAttempts ?? 0, isNewAttempt: true },
    );
  }

  /**
   * Reads a name-change document (marriage certificate, deed poll…) the
   * patient uploaded because the name on their proof didn't match, and
   * re-assesses the proof with it. Never throws.
   */
  async reviewNameEvidence(patientId: string, evidenceFileId: string): Promise<StoredProofReview | null> {
    const submission = await this.prisma.onboardingSubmission.findUnique({ where: { patientId } });
    const stored = submission?.prescriptionProofReview as unknown as StoredProofReview | null;
    if (!stored || stored.fileId !== submission?.prescriptionProofFileId) return null;

    let nameEvidence: NameEvidenceReading | null = null;
    try {
      const file = await this.prisma.uploadedFile.findUnique({ where: { id: evidenceFileId } });
      if (file && file.patientId === patientId) {
        const outcome = await this.reader.readNameEvidence(await this.uploads.readContents(file), file.mimeType);
        if (outcome.status === 'COMPLETED') nameEvidence = outcome.reading;
      }
    } catch (err) {
      this.logger.error(`Could not read name evidence for ${patientId}: ${(err as Error).message}`);
    }

    const { assessment: _a, reviewedAt: _r, failedAttempts, nextStep: _n, ...rest } = stored;
    return this.store(
      patientId,
      // Unread, it still counts as provided: the clinician compares it by eye.
      { ...rest, nameEvidenceFileId: evidenceFileId, nameEvidence: nameEvidence ?? { readable: false, documentType: null, names: [] } },
      { previousFailedAttempts: failedAttempts, isNewAttempt: true },
    );
  }

  /**
   * What the patient's proof has to show to be accepted, from their own account and questionnaire
   * answers: their name, the medicine and dose they told us, and a recent enough date.
   */
  async requirements(patientId: string): Promise<ProofRequirements> {
    const [patient, consultation] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true } }),
      this.prisma.consultation.findFirst({ where: { patientId, kind: ConsultationKind.GLP1 }, orderBy: { submittedAt: 'desc' }, select: { quizAnswers: true } }),
    ]);
    const reported = reportedPriorUse((consultation?.quizAnswers as Array<{ questionId: string; value?: string | null }> | null) ?? []);
    const notBefore = new Date(Date.now() - PRIOR_DOSE_RULES.maxDocumentAgeDays * 86_400_000);
    return {
      name: patient ? `${patient.firstName} ${patient.lastName}` : null,
      medicine: reported?.medicine && reported.medicine !== 'other' ? MEDICINE_LABEL[reported.medicine] : null,
      dose: reported?.doseLabel ?? null,
      notBefore: notBefore.toISOString().slice(0, 10),
    };
  }

  /** The patient's answer to "your document shows X but you told us Y — which is right?". */
  async clarifyDose(patientId: string, choice: DoseClarification): Promise<StoredProofReview | null> {
    const submission = await this.prisma.onboardingSubmission.findUnique({ where: { patientId } });
    const stored = submission?.prescriptionProofReview as unknown as StoredProofReview | null;
    if (!stored || stored.fileId !== submission?.prescriptionProofFileId) return null;
    const { assessment: _a, reviewedAt: _r, failedAttempts, nextStep: _n, ...rest } = stored;
    // Answering a question isn't another upload, so it doesn't count as an attempt.
    return this.store(patientId, { ...rest, doseClarification: choice }, { previousFailedAttempts: failedAttempts, isNewAttempt: false });
  }

  /**
   * Re-runs only the dose rules against the stored reading — free, no model
   * call — for when the questionnaire answers change after the upload.
   */
  async reassess(patientId: string): Promise<StoredProofReview | null> {
    const submission = await this.prisma.onboardingSubmission.findUnique({ where: { patientId } });
    const stored = submission?.prescriptionProofReview as unknown as StoredProofReview | null;
    if (!stored || stored.fileId !== submission?.prescriptionProofFileId) return null;
    // They've said they have no proof: an earlier upload's review mustn't replace that flag.
    if (submission?.prescriptionProofUnavailable) return null;
    const { assessment: _old, reviewedAt: _at, failedAttempts, nextStep: _next, ...rest } = stored;
    return this.store(patientId, rest, { previousFailedAttempts: failedAttempts, isNewAttempt: false });
  }

  private async store(
    patientId: string,
    partial: ReviewInputs,
    attempts: { previousFailedAttempts: number; isNewAttempt: boolean },
  ): Promise<StoredProofReview> {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, include: { lead: true } });
    const consultation = await this.prisma.consultation.findFirst({
      where: { patientId, kind: ConsultationKind.GLP1 },
      orderBy: { submittedAt: 'desc' },
    });
    const answers = (consultation?.quizAnswers as Array<{ questionId: string; value?: string | null }> | null) ?? [];

    const assessment = assessPriorDose({
      patient: { firstName: patient?.firstName ?? '', lastName: patient?.lastName ?? '' },
      requested: await this.requestedDose(patient?.lead?.quizAnswers),
      reported: reportedPriorUse(answers),
      document: partial.reading,
      nameEvidence: partial.nameEvidence ?? null,
      doseClarification: partial.doseClarification ?? null,
      today: new Date(),
    });

    const hasIssues = assessment.documentIssues.length > 0;
    const failedAttempts = attempts.previousFailedAttempts + (attempts.isNewAttempt && hasIssues ? 1 : 0);
    const nextStep: ProofNextStep = !hasIssues ? 'NONE' : failedAttempts >= MAX_SELF_SERVICE_ATTEMPTS ? 'CONTACT_US' : 'REUPLOAD';
    if (nextStep === 'CONTACT_US') {
      assessment.findings.push({
        severity: 'WARNING',
        message: `Document still has issues after ${failedAttempts} attempts — patient offered to message the team`,
      });
    }

    const review: StoredProofReview = { ...partial, assessment, failedAttempts, nextStep, reviewedAt: new Date().toISOString() };
    await this.prisma.onboardingSubmission.update({
      where: { patientId },
      data: { prescriptionProofReview: review as unknown as Prisma.InputJsonValue },
    });
    if (consultation) await this.syncRedFlags(consultation.id, assessment.findings);
    return review;
  }

  /**
   * Puts the serious findings on the consultation as red flags, so the case
   * is prioritised in the queue and the prescriber sees them next to the
   * questionnaire, not only on the onboarding panel.
   */
  private async syncRedFlags(consultationId: string, findings: Assessment['findings']) {
    const flags = findings
      .filter((f) => f.severity !== 'INFO')
      .map((f) => ({
        consultationId,
        description: `${FLAG_PREFIX}${f.message}`,
        severity: f.severity === 'CRITICAL' ? RedFlagSeverity.CRITICAL : RedFlagSeverity.WARNING,
      }));
    await this.prisma.$transaction([
      this.prisma.redFlag.deleteMany({ where: { consultationId, description: { startsWith: FLAG_PREFIX } } }),
      ...(flags.length ? [this.prisma.redFlag.createMany({ data: flags })] : []),
    ]);
  }

  /**
   * The patient used the medicine before but has no proof. Whatever an earlier
   * upload's review said no longer applies; the prescriber is told instead.
   */
  async declareUnavailable(patientId: string) {
    const consultation = await this.prisma.consultation.findFirst({
      where: { patientId, kind: ConsultationKind.GLP1 },
      orderBy: { submittedAt: 'desc' },
      select: { id: true },
    });
    if (!consultation) return;
    await this.syncRedFlags(consultation.id, [
      {
        severity: 'WARNING',
        message: 'Patient reports previous use but has no proof — start-dose rules apply unless verified another way (e.g. with their previous prescriber)',
      },
    ]);
  }

  /** The GLP-1 and strength chosen at checkout, e.g. "Mounjaro 7.5 mg". */
  private async requestedDose(quizAnswers: unknown): Promise<RequestedDose | null> {
    const ordered = await findGlp1Dose(this.prisma, orderedTreatmentText(quizAnswers));
    const molecule = ordered && MOLECULE_OF_SLUG[ordered.productSlug];
    if (!ordered || !molecule || ordered.step === null) return null;
    return { productName: ordered.productName, molecule, label: ordered.label, step: ordered.step, ladder: ordered.ladder };
  }
}

/** The structured prior-use answers from the GLP-1 medical questionnaire (version 2+). */
export function reportedPriorUse(answers: Array<{ questionId: string; value?: string | null }>): ReportedPriorUse | null {
  const value = (id: string) => answers.find((a) => a.questionId === id)?.value ?? null;
  if (value('glp1_prior_use') !== 'yes') return null;
  return {
    medicine: value('glp1_prior_medicine') as ReportedPriorUse['medicine'],
    doseLabel: value('glp1_prior_dose_tirzepatide') ?? value('glp1_prior_dose_semaglutide'),
    lastDose: value('glp1_last_dose') as ReportedPriorUse['lastDose'],
    weeksOnDose: value('glp1_weeks_on_dose') as ReportedPriorUse['weeksOnDose'],
  };
}
