import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { OrdersService } from '../prescriptions/orders.service';
import { BillingService } from '../stripe/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadInput } from './dto/create-lead.input';
import { PostHogService } from '../posthog/posthog.service';
import { PostHogLoggerService } from '../posthog/posthog-logger.service';
import { ReferralsService } from '../referrals/referrals.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { findQuestionnaire } from '../questionnaires/definitions';
import { triageEligibility } from '../questionnaires/triage';
import { INTAKE_MAX_AGE_DAYS, intakeIsFresh } from './intake-age';
import { PreviousAssessmentInput } from './dto/previous-assessment.input';
import { evaluateAnswers } from '../questionnaires/evaluate';
import { CURRENT_CONSENTS } from '../consents/consent-texts';
import { ConsentType, ConsultationKind, RiskTag } from '../common/enums';
import type { RequestMeta } from '../consents/consents.service';

export const EMAIL_TAKEN_MESSAGE = 'An account already exists for this email. Please sign in.';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private posthog: PostHogService,
    private posthogLogger: PostHogLoggerService,
    private referrals: ReferralsService,
    private verification: EmailVerificationService,
    private moduleRef?: ModuleRef,
  ) {}

  /**
   * Someone with an account signs in instead of starting again. The exception is a patient refunded on their first order,
   * whose sign-in is closed: if their prescription is still good they are sent their link to buy the medicine without
   * paying the fee again (and told so here), otherwise they may start over. The email is already proved to be theirs.
   */
  private async assertNoAccount(email: string): Promise<boolean> {
    const taken = await this.prisma.patient.findFirst({ where: { email: { equals: email.trim(), mode: 'insensitive' } }, select: { id: true, accessClosedAt: true, accessClosedReason: true } });
    if (!taken) return false;
    if (!taken.accessClosedAt) throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    // Closed for another reason (six months lapsed): nothing to go back to, they start over.
    if (taken.accessClosedReason !== 'REFUNDED_FIRST_ORDER') return true;
    const offer = await this.moduleRef?.get(OrdersService, { strict: false }).offerReturn(taken.id).catch(() => null);
    if (!offer) return true; // starting over: their old, paid-and-refunded lead is reopened by the caller
    const until = offer.until.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    throw new ConflictException(`You don’t need to do the quiz again. The prescription we wrote for you is still valid until ${until}, and you won’t pay the prescription fee again. We have emailed you the link to order your medicine.`);
  }

  findAll() {
    return this.prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.lead.findUniqueOrThrow({ where: { id } });
  }

  async upsert(input: CreateLeadInput, meta: RequestMeta = {}) {
    // First, so nothing about this email (not even that it has an account) is revealed to someone who can't read its inbox.
    await this.verification.assertVerified(input.email, input.emailVerificationToken);

    // Someone who already has an account (or has paid and is waiting for it) signs in instead of starting again.
    const startingOver = await this.assertNoAccount(input.email);

    const existingLead = await this.prisma.lead.findUnique({
      where: { email: input.email },
      select: { id: true, convertedAt: true, productKind: true },
    });
    if (existingLead?.convertedAt && !startingOver) throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    const intake = this.checkedIntake(input, meta);
    const lead = await this.prisma.lead.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        productKind: input.productKind,
        quizAnswers: input.quizAnswers as any,
        stripeSessionId: input.stripeSessionId,
        ...intake,
      },
      update: {
        productKind: input.productKind,
        quizAnswers: input.quizAnswers as any,
        // The health answers come with the quiz. Without them, another treatment's earlier answers don't carry over.
        ...(intake ?? (existingLead && existingLead.productKind !== input.productKind && { intakeAnswers: Prisma.DbNull, intakeConsentVersion: null, intakeSavedAt: null })),
        stripeSessionId: input.stripeSessionId ?? undefined,
        // A patient refunded and closed who starts over: the earlier payment is behind them, this lead is for the new one.
        ...(startingOver && existingLead?.convertedAt && { convertedAt: null, stripeSessionId: input.stripeSessionId ?? null }),
      },
    });

    this.posthog.identify(lead.id, {
      email: lead.email,
      first_name: lead.firstName,
      last_name: lead.lastName,
      lifecycle_stage: 'lead',
    });
    if (!existingLead) {
      this.posthog.capture(lead.id, 'lead_created', {
        product_kind: lead.productKind,
        has_payment_session: Boolean(lead.stripeSessionId),
      });
      this.posthogLogger.info('lead upsert completed', {
        operation: 'create',
        product_kind: lead.productKind,
        has_payment_session: Boolean(lead.stripeSessionId),
        posthogDistinctId: lead.id,
      });
      await this.referrals.validateAndAttach(input.referralCode, { id: lead.id, email: lead.email });
    } else if (input.referralCode && !existingLead.convertedAt) {
      // Someone who started an assessment earlier and now arrives through a friend's
      // link: attach the referral to their still-unpaid lead (a no-op if it already has one).
      await this.referrals.validateAndAttach(input.referralCode, { id: lead.id, email: lead.email });
    }

    return lead;
  }

  /**
   * A patient refunded on their first order, whose prescription is still good, who has proved the inbox is theirs: what is on
   * offer and where to pay for it, so the website can take them straight to it. Null when there is no such offer.
   */
  async returnOffer(input: PreviousAssessmentInput) {
    await this.verification.assertVerified(input.email, input.emailVerificationToken);
    const patient = await this.prisma.patient.findFirst({ where: { email: { equals: input.email.trim(), mode: 'insensitive' } }, select: { id: true, accessClosedAt: true, accessClosedReason: true } });
    if (!patient?.accessClosedAt || patient.accessClosedReason !== 'REFUNDED_FIRST_ORDER') return null;
    const offer = await this.moduleRef?.get(OrdersService, { strict: false }).offerReturn(patient.id).catch(() => null);
    if (!offer) return null;
    const order = await this.prisma.order.findUnique({ where: { id: offer.orderId }, select: { paymentInvoiceId: true, prescription: { select: { items: { select: { product: { select: { name: true, brandName: true } }, strength: { select: { label: true } } } } } } } });
    const treatment = order?.prescription.items.map((i) => `${i.product.brandName ?? i.product.name} ${i.strength.label}`).join(' + ') || null;
    const details = order?.paymentInvoiceId ? await this.moduleRef?.get(BillingService, { strict: false }).invoicePaymentDetails(order.paymentInvoiceId) : null;
    // Vouchers they have not used: a patient who chose to apply them by hand has none taken off yet, and cannot sign in to do it.
    const waiting = await this.prisma.voucher.aggregate({ where: { patientId: patient.id, status: 'ISSUED' }, _sum: { amountCents: true } });
    return { ...offer, treatment, clientSecret: details?.clientSecret ?? null, totalCents: details?.totalCents ?? null, unusedVoucherCents: waiting._sum.amountCents ?? 0 };
  }

  /** The same offer as a subscription (10% cheaper): the payment to take inside our page. Needs the email proof; null when no offer. */
  async returnSubscription(input: PreviousAssessmentInput) {
    await this.verification.assertVerified(input.email, input.emailVerificationToken);
    const patient = await this.prisma.patient.findFirst({ where: { email: { equals: input.email.trim(), mode: 'insensitive' } }, select: { id: true, accessClosedAt: true, accessClosedReason: true } });
    if (!patient?.accessClosedAt || patient.accessClosedReason !== 'REFUNDED_FIRST_ORDER') return null;
    return (await this.moduleRef?.get(OrdersService, { strict: false }).startReturnSubscription(patient.id)) ?? null;
  }

  /** The lead a returning visitor left unpaid, once they have proved the email is theirs. Null when there is nothing to go back to. */
  private async unpaidLeadFor(input: PreviousAssessmentInput) {
    await this.verification.assertVerified(input.email, input.emailVerificationToken);
    const taken = await this.prisma.patient.findFirst({ where: { email: { equals: input.email.trim(), mode: 'insensitive' } }, select: { accessClosedAt: true } });
    // A closed account has no earlier assessment to resume (and must not be sent its offer again from here): nothing to go back to.
    if (taken?.accessClosedAt) return null;
    if (taken) throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    const lead = await this.prisma.lead.findFirst({ where: { email: { equals: input.email.trim(), mode: 'insensitive' }, convertedAt: null } });
    // Answers for another treatment aren't comparable with this quiz, and a lead with no health answers has nothing to keep.
    return lead && lead.productKind === input.productKind && lead.intakeSavedAt ? { ...lead, intakeSavedAt: lead.intakeSavedAt } : null;
  }

  private keepVerdict(lead: { intakeSavedAt: Date; productKind: string; quizAnswers: unknown; intakeAnswers: unknown; intakeConsentVersion: string | null }) {
    if (!intakeIsFresh(lead.intakeSavedAt)) return `Your earlier health answers are more than ${INTAKE_MAX_AGE_DAYS} days old, so we need current ones.`;
    // The same checks saving a quiz makes (checkedIntake). Without them a visitor could keep answers, pay, and then be asked
    // the health questions again in the portal because the questionnaire or the consent wording changed in the meantime.
    if (lead.intakeConsentVersion !== CURRENT_CONSENTS[ConsentType.TELEHEALTH].version) return 'The consent statement has changed since you answered, so please answer the health questions again.';
    const intake = Array.isArray(lead.intakeAnswers) ? (lead.intakeAnswers as Array<{ questionId: string; answer: string; value?: string | null }>) : [];
    if (evaluateAnswers(findQuestionnaire(lead.productKind as ConsultationKind, 'INTAKE'), intake, true).errors.length > 0) return 'The health questions have changed since you answered, so please answer them again.';
    const triage = triageEligibility(lead.productKind as ConsultationKind, lead.quizAnswers as any[]);
    if (triage.riskTag === RiskTag.RED) return 'Your earlier answers mean we can’t offer this treatment online.';
    return null;
  }

  /**
   * What someone who did the quiz before, and never paid, answered then, for the quiz to set beside what they have just
   * answered. Only after they have proved the inbox is theirs: these are health answers.
   */
  async previousAssessment(input: PreviousAssessmentInput) {
    const lead = await this.unpaidLeadFor(input);
    if (!lead) return null;
    const questions = new Map(findQuestionnaire(lead.productKind as ConsultationKind, 'INTAKE').questions.map((q) => [q.id, q.text]));
    const intake = (Array.isArray(lead.intakeAnswers) ? lead.intakeAnswers : []) as Array<{ questionId: string; answer: string; value?: string | null }>;
    const blocked = this.keepVerdict(lead);
    return {
      productKind: lead.productKind,
      savedAt: lead.updatedAt,
      healthSavedAt: lead.intakeSavedAt,
      eligibility: (Array.isArray(lead.quizAnswers) ? lead.quizAnswers : []) as any[],
      health: intake.map((a) => ({ questionId: a.questionId, question: questions.get(a.questionId) ?? a.questionId, answer: a.answer, value: a.value ?? undefined })),
      canKeep: !blocked,
      keepBlockedReason: blocked ?? undefined,
    };
  }

  /** Goes on with the answers saved earlier instead of today's. The same checks as for the comparison: fresh, and not ruled out. */
  async resumeLead(input: PreviousAssessmentInput) {
    const lead = await this.unpaidLeadFor(input);
    if (!lead) throw new BadRequestException('We couldn’t find your earlier answers. Please answer the questions again.');
    const blocked = this.keepVerdict(lead);
    if (blocked) throw new BadRequestException(blocked);
    // Coming back counts as activity, for the "last activity" a clinician sees and for when reminders are due.
    return this.prisma.lead.update({ where: { id: lead.id }, data: { updatedAt: new Date() } });
  }

  markConverted(id: string) {
    return this.prisma.lead.update({
      where: { id },
      data: { convertedAt: new Date() },
    });
  }

  /**
   * The health answers that came with the quiz, checked exactly as they will be when they become the visitor's
   * consultation, so a payment is never taken for answers that would then be refused. Answers that raise clinical
   * flags are kept as they are: the doctor decides, as for the portal questionnaire. Null when the quiz sent none.
   */
  private checkedIntake(input: CreateLeadInput, meta: RequestMeta) {
    if (!input.intakeAnswers) return null;
    const evaluation = evaluateAnswers(findQuestionnaire(input.productKind as ConsultationKind, 'INTAKE'), input.intakeAnswers, true);
    if (evaluation.errors.length) throw new BadRequestException(evaluation.errors.join(' '));
    if (input.telehealthConsentVersion !== CURRENT_CONSENTS[ConsentType.TELEHEALTH].version) {
      throw new BadRequestException('The consent statement has been updated — please reload the page and review it again');
    }
    return {
      intakeAnswers: input.intakeAnswers.map(({ questionId, answer, value }) => ({ questionId, answer, value: value ?? null })) as any,
      intakeConsentVersion: input.telehealthConsentVersion,
      intakeConsentIp: meta.ip ?? null,
      intakeConsentUserAgent: meta.userAgent ?? null,
      intakeSavedAt: new Date(),
    };
  }
}
