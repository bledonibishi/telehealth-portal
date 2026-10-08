import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadInput } from './dto/create-lead.input';
import { PostHogService } from '../posthog/posthog.service';
import { PostHogLoggerService } from '../posthog/posthog-logger.service';
import { ReferralsService } from '../referrals/referrals.service';
import { SaveLeadIntakeInput } from './dto/save-lead-intake.input';
import { findQuestionnaire } from '../questionnaires/definitions';
import { evaluateAnswers } from '../questionnaires/evaluate';
import { CURRENT_CONSENTS } from '../consents/consent-texts';
import { ConsentType, ConsultationKind } from '../common/enums';
import type { RequestMeta } from '../consents/consents.service';

export const EMAIL_TAKEN_MESSAGE = 'An account already exists for this email. Please sign in.';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private posthog: PostHogService,
    private posthogLogger: PostHogLoggerService,
    private referrals: ReferralsService,
  ) {}

  findAll() {
    return this.prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.lead.findUniqueOrThrow({ where: { id } });
  }

  async upsert(input: CreateLeadInput) {
    // Someone who already has an account (or has paid and is waiting for it) signs in instead of starting again.
    const taken = await this.prisma.patient.findFirst({ where: { email: { equals: input.email.trim(), mode: 'insensitive' } }, select: { id: true } });
    if (taken) throw new ConflictException(EMAIL_TAKEN_MESSAGE);

    const existingLead = await this.prisma.lead.findUnique({
      where: { email: input.email },
      select: { id: true, convertedAt: true, productKind: true },
    });
    if (existingLead?.convertedAt) throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    const lead = await this.prisma.lead.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        productKind: input.productKind,
        quizAnswers: input.quizAnswers as any,
        stripeSessionId: input.stripeSessionId,
      },
      update: {
        productKind: input.productKind,
        quizAnswers: input.quizAnswers as any,
        // Answers to another treatment's medical questionnaire don't carry over.
        ...(existingLead && existingLead.productKind !== input.productKind && { intakeAnswers: Prisma.DbNull, intakeConsentVersion: null, intakeSavedAt: null }),
        stripeSessionId: input.stripeSessionId ?? undefined,
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

  markConverted(id: string) {
    return this.prisma.lead.update({
      where: { id },
      data: { convertedAt: new Date() },
    });
  }

  /**
   * The medical questionnaire, answered on the website after the visitor has chosen a treatment and before they
   * pay. Checked here exactly as it will be when it becomes their consultation, so a payment is never taken for
   * answers that would then be refused. Answers that raise clinical flags are kept as they are: the doctor
   * decides, as they do for the portal questionnaire.
   */
  async saveIntake(input: SaveLeadIntakeInput, meta: RequestMeta = {}) {
    const lead = await this.prisma.lead.findUnique({ where: { id: input.leadId } });
    // The same reply for an unknown id and a wrong email, so ids can't be probed.
    if (!lead || lead.email.toLowerCase() !== input.email.trim().toLowerCase()) throw new NotFoundException('We couldn’t find your assessment — please start again.');
    if (lead.convertedAt) throw new ConflictException('This order has already been paid.');

    const evaluation = evaluateAnswers(findQuestionnaire(lead.productKind as ConsultationKind, 'INTAKE'), input.answers, true);
    if (evaluation.errors.length) throw new BadRequestException(evaluation.errors.join(' '));
    if (input.telehealthConsentVersion !== CURRENT_CONSENTS[ConsentType.TELEHEALTH].version) {
      throw new BadRequestException('The consent statement has been updated — please reload the page and review it again');
    }

    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        intakeAnswers: input.answers.map(({ questionId, answer, value }) => ({ questionId, answer, value: value ?? null })) as any,
        intakeConsentVersion: input.telehealthConsentVersion,
        intakeConsentIp: meta.ip ?? null,
        intakeConsentUserAgent: meta.userAgent ?? null,
        intakeSavedAt: new Date(),
      },
    });
    this.posthog.capture(lead.id, 'lead_intake_saved', { product_kind: lead.productKind });
    return true;
  }
}
