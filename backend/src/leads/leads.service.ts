import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadInput } from './dto/create-lead.input';
import { RequestManualInvoiceInput } from './dto/request-manual-invoice.input';
import { PostHogService } from '../posthog/posthog.service';
import { PostHogLoggerService } from '../posthog/posthog-logger.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private posthog: PostHogService,
    private posthogLogger: PostHogLoggerService,
    private email: EmailService,
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
      select: { id: true },
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
    }

    return lead;
  }

  markConverted(id: string) {
    return this.prisma.lead.update({
      where: { id },
      data: { convertedAt: new Date() },
    });
  }

  // Paysera has no API integration yet (no merchant account) — this just records
  // the customer's intent and sends a manual invoice email to ops, who follow up
  // with a payment link by hand. See EmailService for the actual email content.
  async requestManualInvoice(input: RequestManualInvoiceInput) {
    const lead = await this.prisma.lead.findUnique({ where: { id: input.leadId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const updated = await this.prisma.lead.update({
      where: { id: input.leadId },
      data: {
        selectedPlanId: input.planId,
        selectedPlanName: input.planName,
        paymentMethodRequested: PaymentMethod.PAYSERA,
        paymentRequestedAt: new Date(),
      },
    });

    this.posthog.capture(lead.id, 'manual_invoice_requested', {
      plan_id: input.planId,
      plan_name: input.planName,
      payment_method: 'PAYSERA',
    });

    await Promise.all([
      this.email.sendPayseraInvoiceOpsNotification(updated),
      this.email.sendPayseraInvoiceCustomerConfirmation(updated.email, updated.firstName, input.planName),
    ]);

    return updated;
  }
}
