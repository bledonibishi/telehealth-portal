import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadInput } from './dto/create-lead.input';
import { PostHogService } from '../posthog/posthog.service';
import { PostHogLoggerService } from '../posthog/posthog-logger.service';
import { ReferralsService } from '../referrals/referrals.service';

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
    const existingLead = await this.prisma.lead.findUnique({
      where: { email: input.email },
      select: { id: true, convertedAt: true },
    });
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
}
