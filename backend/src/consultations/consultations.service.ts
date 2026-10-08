import { Injectable, BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionProofReviewService } from '../onboarding/prescription-proof-review.service';
import { DosePricingService } from '../stripe/dose-pricing.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../stripe/billing.service';
import { PartnerOrdersService } from '../prescriptions/partner-orders.service';
import { PrescribingService } from '../prescriptions/prescribing.service';
import { ConsentType, ConsultationKind, ProductCategory, ConsultationStatus, RiskTag, UserRole } from '../common/enums';
import { ApproveConsultationInput } from './dto/approve-consultation.input';
import { DeclineConsultationInput } from './dto/decline-consultation.input';
import { SubmitIntakeQuizInput } from './dto/submit-intake-quiz.input';
import { PostHogService } from '../posthog/posthog.service';
import { PostHogLoggerService } from '../posthog/posthog-logger.service';
import { findQuestionnaire, versionTag } from '../questionnaires/definitions';
import { MessagingService } from '../messaging/messaging.service';
import { EmailService } from '../email/email.service';
import { ConsentsService, RequestMeta } from '../consents/consents.service';
import { StoredAnswer, evaluateAnswers } from '../questionnaires/evaluate';
import { triage } from '../questionnaires/triage';

const REVIEWABLE = [
  ConsultationStatus.SUBMITTED,
  ConsultationStatus.IN_REVIEW,
  ConsultationStatus.MORE_INFO_REQUESTED,
] as const;

const RISK_RANK: Record<RiskTag, number> = { [RiskTag.RED]: 0, [RiskTag.ORANGE]: 1, [RiskTag.GREEN]: 2 };

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private posthog: PostHogService,
    private posthogLogger: PostHogLoggerService,
    private billing: BillingService,
    private config: ConfigService,
    private prescribing: PrescribingService,
    private messaging: MessagingService,
    private email: EmailService,
    private consents: ConsentsService,
    private partner: PartnerOrdersService,
    private proofReview: PrescriptionProofReviewService,
    private dosePricing: DosePricingService,
  ) {}

  // A doctor who has claimed a consultation owns the decision; others (bar
  // admins) must wait for them to release it.
  private assertMayDecide(c: { status: string; clinicianId: string | null; clinician?: { firstName: string; lastName: string } | null }, actorId: string, isAdmin: boolean) {
    if (c.status === ConsultationStatus.IN_REVIEW && c.clinicianId && c.clinicianId !== actorId && !isAdmin) {
      const who = c.clinician ? `Dr ${c.clinician.lastName}` : 'another clinician';
      throw new ForbiddenException(`This consultation is being reviewed by ${who}`);
    }
  }

  async claim(clinicianId: string, consultationId: string, isAdmin = false) {
    const c = await this.findById(consultationId);
    if (!REVIEWABLE.includes(c.status as any)) {
      throw new ForbiddenException('Consultation is not in a reviewable state');
    }
    if (c.status === ConsultationStatus.MORE_INFO_REQUESTED) {
      throw new ForbiddenException('Waiting for the patient to reply');
    }
    this.assertMayDecide(c, clinicianId, isAdmin);
    if (c.status === ConsultationStatus.IN_REVIEW && c.clinicianId === clinicianId) return c;

    // Conditional update: two doctors clicking at once can't both win.
    const { count } = await this.prisma.consultation.updateMany({
      where: {
        id: consultationId,
        OR: [{ status: ConsultationStatus.SUBMITTED }, ...(isAdmin ? [{ status: ConsultationStatus.IN_REVIEW }] : [])],
      },
      data: { status: ConsultationStatus.IN_REVIEW, clinicianId },
    });
    if (count === 0) throw new ConflictException('Someone else has just claimed this consultation');

    await this.audit.log({
      actorId: clinicianId,
      actorRole: UserRole.CLINICIAN,
      action: 'CONSULTATION_CLAIMED',
      resourceType: 'Consultation',
      resourceId: consultationId,
      patientId: c.patientId,
      metadata: c.clinicianId && c.clinicianId !== clinicianId ? { takenFrom: c.clinicianId } : undefined,
    });
    return this.findById(consultationId);
  }

  async release(clinicianId: string, consultationId: string, isAdmin = false) {
    const c = await this.findById(consultationId);
    if (c.status !== ConsultationStatus.IN_REVIEW) throw new ForbiddenException('Consultation is not claimed');
    this.assertMayDecide(c, clinicianId, isAdmin);

    await this.prisma.$transaction(async (tx) => {
      await tx.consultation.update({
        where: { id: consultationId },
        data: { status: ConsultationStatus.SUBMITTED, clinicianId: null },
      });
      await this.audit.log(
        {
          actorId: clinicianId,
          actorRole: UserRole.CLINICIAN,
          action: 'CONSULTATION_RELEASED',
          resourceType: 'Consultation',
          resourceId: consultationId,
          patientId: c.patientId,
        },
        tx,
      );
    });
    return this.findById(consultationId);
  }

  // Best effort: a failed email or message must not undo a clinical decision
  // that is already saved.
  private async notifyPatient(
    patient: { email: string; firstName: string },
    headline: string,
    message?: { consultationId: string; clinicianId: string; content?: string },
  ) {
    try {
      if (message?.content?.trim()) {
        await this.messaging.send(message.clinicianId, UserRole.CLINICIAN, {
          consultationId: message.consultationId,
          content: message.content.trim(),
        });
      }
      const portal = this.config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3000';
      await this.email.sendConsultationUpdateEmail(patient.email, patient.firstName, headline, `${portal}/dashboard`);
    } catch (err: any) {
      this.logger.error(`Patient notification "${headline}" failed: ${err?.message}`);
    }
  }

  async findQueue() {
    const rows = await this.prisma.consultation.findMany({
      where: { status: { in: REVIEWABLE as any } },
      include: { patient: true, clinician: true, redFlags: true },
      orderBy: { submittedAt: 'asc' },
    });

    // Stable sort: within a tag, the longest wait stays first.
    const rank = (c: (typeof rows)[number]) => RISK_RANK[triage(c.redFlags).riskTag];
    return rows.sort((a, b) => rank(a) - rank(b));
  }

  async findById(id: string) {
    const c = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        patient: true,
        clinician: true,
        redFlags: { orderBy: { severity: 'asc' } },
        prescription: true,
        messages: { orderBy: { sentAt: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException(`Consultation ${id} not found`);
    return c;
  }

  // The eligibility quiz was answered on the marketing site before payment and
  // lives on the lead. Re-check it here, since that screen runs client-side.
  private async eligibilityFromLead(patientId: string, kind: ConsultationKind) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, include: { lead: true } });
    const lead = patient?.lead;
    if (!lead || lead.productKind !== kind || !Array.isArray(lead.quizAnswers)) {
      return { answers: [] as StoredAnswer[], flags: [] };
    }
    const leadAnswers = lead.quizAnswers as Array<{ questionId: string; question?: string; answer: string }>;
    const questionnaire = findQuestionnaire(kind, 'ELIGIBILITY');
    const evaluation = evaluateAnswers(questionnaire, leadAnswers, false);
    // Keep extra answers the site sent (e.g. preferred medicine) verbatim.
    const known = new Set(questionnaire.questions.map((q) => q.id));
    const extras = leadAnswers
      .filter((a) => !known.has(a.questionId))
      .map((a) => ({ questionId: a.questionId, question: a.question ?? a.questionId, answer: a.answer, value: null, section: questionnaire.title }));
    return { answers: [...evaluation.answers, ...extras], flags: evaluation.flags };
  }

  findByPatient(patientId: string) {
    return this.prisma.consultation.findMany({
      where: { patientId },
      // Messages let the patient app show one conversation across all their consultations.
      include: { redFlags: true, prescription: true, messages: { orderBy: { sentAt: 'asc' } } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  // The medical questionnaire a paid patient fills in; creates the
  // consultation the doctor reviews. Answers that rule the patient out don't
  // block submission — they have already paid, so the consultation goes to the
  // top of the queue as a critical red flag and a decline refunds them.
  async submitIntakeQuiz(patientId: string, input: SubmitIntakeQuizInput, meta: RequestMeta = {}) {
    const intake = findQuestionnaire(input.kind, 'INTAKE');
    const evaluation = evaluateAnswers(intake, input.answers, true);
    if (evaluation.errors.length) throw new BadRequestException(evaluation.errors.join(' '));

    const eligibility = await this.eligibilityFromLead(patientId, input.kind);
    const answers = [...eligibility.answers, ...evaluation.answers];
    const flags = uniqueFlags([...eligibility.flags, ...evaluation.flags]);

    const open = await this.prisma.consultation.findFirst({
      where: { patientId, kind: input.kind, status: { in: REVIEWABLE as any } },
    });
    if (open && open.status !== ConsultationStatus.MORE_INFO_REQUESTED) {
      throw new ConflictException('Your consultation is already with our clinical team — we’ll be in touch soon.');
    }
    if (!open) {
      // A decline cancels and refunds the subscription, so a fresh consultation
      // would be unpaid. Starting again goes through support.
      const refunded = await this.prisma.consultation.count({
        where: { patientId, kind: input.kind, status: ConsultationStatus.DECLINED, refundStatus: 'REFUNDED' },
      });
      if (refunded > 0) {
        throw new ForbiddenException('Your previous consultation was declined and refunded — please contact us to start a new one.');
      }
    }

    await this.consents.record(patientId, ConsentType.TELEHEALTH, input.telehealthConsentVersion, meta);

    const data = {
      quizAnswers: answers as any,
      questionnaireVersion: versionTag(intake),
    };
    const include = { patient: true, redFlags: true, messages: true };
    const consultation = open
      ? // Answering a doctor's request for more information: replace the
        // answers and flags, and put it back in the queue.
        await this.prisma.consultation.update({
          where: { id: open.id },
          data: {
            ...data,
            status: ConsultationStatus.SUBMITTED,
            redFlags: { deleteMany: {}, create: flags },
          },
          include,
        })
      : await this.prisma.consultation.create({
          data: { patientId, kind: input.kind, ...data, redFlags: { create: flags } },
          include,
        });
    if (input.kind === ConsultationKind.GLP1) await this.syncPriorUse(patientId, evaluation.answers);

    if (!open) {
      // Anything the patient and the team said before there was a
      // consultation (e.g. help during onboarding) joins this thread.
      const moved = await this.prisma.message.updateMany({ where: { patientId, consultationId: null }, data: { consultationId: consultation.id } });
      if (moved.count) consultation.messages = await this.prisma.message.findMany({ where: { consultationId: consultation.id }, orderBy: { sentAt: 'asc' } });
    }

    await this.audit.log({
      actorId: patientId,
      actorRole: UserRole.PATIENT,
      action: open ? 'CONSULTATION_RESUBMITTED' : 'CONSULTATION_SUBMITTED',
      resourceType: 'Consultation',
      resourceId: consultation.id,
      patientId,
      metadata: { questionnaireVersion: data.questionnaireVersion, redFlags: flags.length },
    });

    this.posthog.capture(patientId, 'consultation_submitted', {
      consultation_id: consultation.id,
      consultation_kind: consultation.kind,
      warning_count: consultation.redFlags.length,
    });
    this.posthogLogger.info('consultation workflow completed', {
      operation: 'submit',
      status: consultation.status,
      consultation_id: consultation.id,
      consultation_kind: consultation.kind,
      posthogDistinctId: patientId,
    });

    return consultation;
  }

  /**
   * Each dose has its own price, and the patient paid for the dose they ordered. If the clinician's
   * first prescription is a different one (e.g. a lower starting dose), bill that from next month
   * and refund the difference if it's cheaper. After the approval, never part of it: a billing problem is
   * recorded for fixing by hand rather than undoing the clinical decision.
   */
  private async billPrescribedDose(
    clinicianId: string,
    patient: { id: string; email: string; stripeCustomerId: string | null; stripeSubscriptionId: string | null },
    kind: ConsultationKind,
    prescriptionId: string,
  ): Promise<string | null> {
    try {
      const items = await this.prisma.prescriptionItem.findMany({ where: { prescriptionId }, include: { product: true, strength: true } });
      const priceIds = this.dosePricing.priceIdsFor(
        kind,
        items.map((i) => ({ category: i.product.category, titrationStep: i.strength.titrationStep, stripePriceId: i.strength.stripePriceId })),
      );
      if (!priceIds) return null;
      const doseLabel = items.length
        ? items.map((i) => `${i.product.brandName ?? i.product.name} ${i.strength.label}`).join(' + ')
        : 'the prescribed plan';
      // Only the first prescription replaces the dose ordered at checkout. A later one (e.g. a new
      // consultation months in) must not refund a month that was billed correctly.
      const earlier = await this.prisma.prescription.count({ where: { patientId: patient.id, id: { not: prescriptionId } } });
      if (earlier > 0) {
        return `Billing unchanged: not the patient’s first prescription — if ${doseLabel} is priced differently, change the plan in Stripe from the next cycle`;
      }
      const note = await this.billing.moveToPrescribedPrice(patient, priceIds, doseLabel);
      await this.audit.log({
        actorId: clinicianId,
        actorRole: UserRole.CLINICIAN,
        action: 'BILLING_MATCHED_TO_PRESCRIPTION',
        resourceType: 'Prescription',
        resourceId: prescriptionId,
        patientId: patient.id,
        metadata: { priceIds, note },
      });
      return note;
    } catch (err: any) {
      this.logger.error(`Billing the prescribed dose for ${patient.id} failed: ${err?.message}`);
      return 'Billing couldn’t be updated automatically — check the subscription in Stripe';
    }
  }

  /**
   * The questionnaire is where the patient says whether, and which, GLP-1 they
   * used before. That decides whether the proof-of-prescription step applies,
   * and the proof is checked against those answers — so re-run the check.
   */
  private async syncPriorUse(patientId: string, answers: Array<{ questionId: string; value: string | null }>) {
    const value = answers.find((a) => a.questionId === 'glp1_prior_use')?.value;
    if (value !== 'yes' && value !== 'no') return;
    const priorMedicationUse = value === 'yes';
    await this.prisma.onboardingSubmission.upsert({
      where: { patientId },
      create: { patientId, priorMedicationUse },
      update: {
        priorMedicationUse,
        ...(priorMedicationUse
          ? {}
          : { prescriptionProofType: null, prescriptionProofFileId: null, prescriptionProofReview: Prisma.DbNull, prescriptionProofUnavailable: false }),
      },
    });
    if (priorMedicationUse) await this.proofReview.reassess(patientId).catch(() => null);
  }

  async approve(clinicianId: string, input: ApproveConsultationInput, isAdmin = false) {
    const c = await this.findById(input.consultationId);
    if (!REVIEWABLE.includes(c.status as any)) {
      throw new ForbiddenException('Consultation is not in a reviewable state');
    }
    this.assertMayDecide(c, clinicianId, isAdmin);
    await this.prescribing.assertCanPrescribe(clinicianId);
    await this.prescribing.assertIdentityVerified(c.patientId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const prescription = await this.prescribing.issue(
        {
          consultationId: c.id,
          patientId: c.patientId,
          prescriberId: clinicianId,
          kind: c.kind as ConsultationKind,
          answers: (c.quizAnswers as any[]) ?? [],
          items: input.items,
          notes: input.notes,
          validityDays: input.validityDays,
          refillsAllowed: input.refillsAllowed,
          overrideReason: input.overrideReason,
        },
        tx,
      );
      const consultation = await tx.consultation.update({
        where: { id: input.consultationId },
        data: { status: ConsultationStatus.APPROVED, clinicianId },
        include: { patient: true, clinician: true, redFlags: true, prescription: true, messages: true },
      });
      // Same transaction as the decision: an approval that can't be recorded doesn't happen.
      await this.audit.log(
        {
          actorId: clinicianId,
          actorRole: UserRole.CLINICIAN,
          action: 'CONSULTATION_APPROVED',
          resourceType: 'Consultation',
          resourceId: input.consultationId,
          patientId: c.patientId,
          metadata: {
            prescriptionId: prescription.id,
            medication: prescription.medication,
            dosage: prescription.dosage,
            contentHash: prescription.contentHash,
            overrideReason: prescription.overrideReason,
          },
        },
        tx,
      );
      return { ...consultation, prescription };
    });

    await this.notifyPatient(updated.patient, 'Your treatment has been approved');
    const billingNote = await this.billPrescribedDose(clinicianId, updated.patient, c.kind as ConsultationKind, updated.prescription.id);

    // The first supply is ready: pass it to the pharmacy partner (a failure is retried later, never undoes the approval).
    await this.partner.trySendForPrescription(updated.prescription.id);

    this.posthog.capture(clinicianId, 'consultation_approved', {
      consultation_id: updated.id,
      consultation_kind: updated.kind,
      previous_status: c.status,
    });
    this.posthogLogger.info('consultation workflow completed', {
      operation: 'approve',
      status: updated.status,
      consultation_id: updated.id,
      consultation_kind: updated.kind,
      posthogDistinctId: clinicianId,
    });

    return { ...updated, billingNote: billingNote ?? undefined };
  }

  async decline(clinicianId: string, input: DeclineConsultationInput, isAdmin = false) {
    const c = await this.findById(input.consultationId);
    if (!REVIEWABLE.includes(c.status as any)) {
      throw new ForbiddenException('Consultation is not in a reviewable state');
    }
    this.assertMayDecide(c, clinicianId, isAdmin);

    const refund = await this.refundIfNothingPrescribed(c.patientId, c.id, c.patient);

    const updated = await this.prisma.$transaction(async (tx) => {
      const declined = await tx.consultation.update({
        where: { id: input.consultationId },
        data: {
          status: ConsultationStatus.DECLINED,
          clinicianId,
          declineReason: input.reason,
          refundStatus: refund.status,
        },
        include: { patient: true, clinician: true, redFlags: true, prescription: true, messages: true },
      });
      await this.audit.log(
        {
          actorId: clinicianId,
          actorRole: UserRole.CLINICIAN,
          action: 'CONSULTATION_DECLINED',
          resourceType: 'Consultation',
          resourceId: input.consultationId,
          patientId: c.patientId,
          metadata: { reason: input.reason, refund },
        },
        tx,
      );
      return declined;
    });

    await this.notifyPatient(updated.patient, 'An update on your consultation', {
      consultationId: updated.id,
      clinicianId,
      content: input.messageToPatient,
    });

    this.posthog.capture(clinicianId, 'consultation_declined', {
      consultation_id: updated.id,
      consultation_kind: updated.kind,
      previous_status: c.status,
    });
    this.posthogLogger.info('consultation workflow completed', {
      operation: 'decline',
      status: updated.status,
      consultation_id: updated.id,
      consultation_kind: updated.kind,
      posthogDistinctId: clinicianId,
    });

    return updated;
  }

  // The patient paid at checkout. If this decline leaves them with nothing
  // prescribed, cancel the subscription and refund. A patient already on an
  // approved treatment keeps paying for it — declining a second request
  // (e.g. adding GLP-1 on top of HRT) mustn't cancel the first.
  private async refundIfNothingPrescribed(
    patientId: string,
    consultationId: string,
    patient: { email: string; stripeCustomerId: string | null; stripeSubscriptionId: string | null },
  ) {
    const approvedElsewhere = await this.prisma.consultation.count({
      where: { patientId, id: { not: consultationId }, status: ConsultationStatus.APPROVED },
    });
    if (approvedElsewhere > 0) {
      return { status: 'NOT_REQUIRED' as const, reason: 'Patient has another approved consultation' };
    }
    return this.billing.cancelAndRefund(patient);
  }

  async requestMoreInfo(clinicianId: string, consultationId: string, message?: string, isAdmin = false) {
    const c = await this.findById(consultationId);
    if (
      ![ConsultationStatus.SUBMITTED, ConsultationStatus.IN_REVIEW].includes(c.status as any)
    ) {
      throw new ForbiddenException('Consultation is not in a reviewable state');
    }
    this.assertMayDecide(c, clinicianId, isAdmin);

    const updated = await this.prisma.$transaction(async (tx) => {
      const requested = await tx.consultation.update({
        where: { id: consultationId },
        data: { status: ConsultationStatus.MORE_INFO_REQUESTED, clinicianId },
        include: { patient: true, clinician: true, redFlags: true, prescription: true, messages: true },
      });
      await this.audit.log(
        {
          actorId: clinicianId,
          actorRole: UserRole.CLINICIAN,
          action: 'CONSULTATION_MORE_INFO_REQUESTED',
          resourceType: 'Consultation',
          resourceId: consultationId,
          patientId: c.patientId,
        },
        tx,
      );
      return requested;
    });

    await this.notifyPatient(updated.patient, 'Your clinician has a question', {
      consultationId,
      clinicianId,
      content: message,
    });

    this.posthog.capture(clinicianId, 'consultation_more_info_requested', {
      consultation_id: updated.id,
      consultation_kind: updated.kind,
      previous_status: c.status,
    });
    this.posthogLogger.info('consultation workflow completed', {
      operation: 'request_more_info',
      status: updated.status,
      consultation_id: updated.id,
      consultation_kind: updated.kind,
      posthogDistinctId: clinicianId,
    });

    return updated;
  }
}

function uniqueFlags<T extends { description: string }>(flags: T[]): T[] {
  return flags.filter((f, i) => flags.findIndex((g) => g.description === f.description) === i);
}
