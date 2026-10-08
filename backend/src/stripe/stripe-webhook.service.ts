import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import Stripe from 'stripe';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ReferralsService } from '../referrals/referrals.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { newActivationToken } from '../auth/activation-token';
import { ConsultationsService } from '../consultations/consultations.service';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);
  private appUrl: string;

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService,
    private referrals: ReferralsService,
    private audit: AuditService,
    // Looked up when needed: ConsultationsModule already imports this module, so it can't be injected directly.
    private moduleRef: ModuleRef,
  ) {
    this.appUrl = config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3001';
  }

  async handle(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = session.customer_details?.email ?? (session.metadata?.email as string);
        await this.activatePatient(
          email,
          session.id,
          { customerId: stripeId(session.customer), subscriptionId: stripeId(session.subscription) },
          // What Stripe actually took off this payment — not a flag the client could set.
          (session.total_details?.amount_discount ?? 0) > 0,
        );
        break;
      }
      case 'invoice.payment_succeeded': {
        // Fires for the inline Stripe Payment Element flow (checkout.service.ts's
        // createSubscriptionIntent) — that flow never creates a Checkout Session,
        // so checkout.session.completed never fires for it. Also fires on every
        // later monthly renewal invoice, but activatePatient's convertedAt check
        // makes that a no-op.
        // Cast: invoice.subscription exists on the pinned '2023-10-16' API
        // version but not in the newer SDK's types.
        const invoice = event.data.object as Stripe.Invoice & { subscription?: unknown };
        const discountCents = ((invoice as any).total_discount_amounts ?? []).reduce(
          (sum: number, d: { amount: number }) => sum + d.amount,
          0,
        );
        await this.activatePatient(
          invoice.customer_email,
          invoice.id,
          { customerId: stripeId(invoice.customer), subscriptionId: stripeId(invoice.subscription) },
          discountCents > 0,
        );
        break;
      }
      case 'customer.subscription.deleted': {
        // The patient cancelled in Stripe's billing portal (or it ended at period end): stop shipping.
        const subscription = event.data.object as Stripe.Subscription;
        await this.endSubscription(subscription.id);
        break;
      }
      default:
        this.logger.debug(`Unhandled event type: ${event.type}`);
    }
  }

  private async endSubscription(subscriptionId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { stripeSubscriptionId: subscriptionId }, select: { id: true } });
    if (!patient) return; // an abandoned checkout's subscription, or one we never linked to a patient
    // Only the first report counts; Stripe may deliver an event more than once.
    const { count } = await this.prisma.patient.updateMany({
      where: { id: patient.id, subscriptionEndedAt: null },
      data: { subscriptionEndedAt: new Date() },
    });
    if (count === 0) return;
    this.logger.log(`Subscription ${subscriptionId} ended — patient ${patient.id} will not be sent further supplies`);
    await this.audit.log({
      actorId: 'system:stripe',
      actorRole: UserRole.ADMIN,
      action: 'SUBSCRIPTION_ENDED',
      resourceType: 'Patient',
      resourceId: patient.id,
      metadata: { subscriptionId },
    });
  }

  /** Never throws: a failure is logged and the patient is asked the questionnaire in the portal instead. */
  private async createConsultationFromLead(email: string) {
    try {
      const patient = await this.prisma.patient.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
      if (patient) await this.moduleRef.get(ConsultationsService, { strict: false }).submitFromLead(patient.id);
    } catch (err: any) {
      this.logger.error(`Creating the consultation from the website answers for ${email} failed: ${err?.message}`);
    }
  }

  private async activatePatient(
    email: string | null | undefined,
    stripeReferenceId: string,
    stripeIds: { customerId: string | null; subscriptionId: string | null },
    rewardApplied: boolean,
  ) {
    if (!email) {
      this.logger.warn(`Payment event has no email — reference ${stripeReferenceId}`);
      return;
    }

    // Find the lead by email
    const lead = await this.prisma.lead.findUnique({ where: { email } });
    if (!lead) {
      this.logger.warn(`No lead found for email ${email} — reference ${stripeReferenceId}`);
      return;
    }

    // Only set ids Stripe actually sent, so a later event without them can't blank them out.
    const billing = {
      ...(stripeIds.customerId && { stripeCustomerId: stripeIds.customerId }),
      ...(stripeIds.subscriptionId && { stripeSubscriptionId: stripeIds.subscriptionId }),
    };

    // Idempotency: if already converted, skip (also covers subscription renewal invoices)
    if (lead.convertedAt) {
      // Still backfill billing ids — a declined consultation needs them to refund.
      if (Object.keys(billing).length) {
        await this.prisma.patient.updateMany({ where: { email }, data: billing });
      }
      // A payment event after the first (renewals, the second event of one payment) is another chance to turn the
      // website answers into the consultation if that failed the first time. Harmless when it already exists.
      await this.createConsultationFromLead(email);
      this.logger.log(`Lead ${lead.id} already converted — skipping`);
      return;
    }

    // Generate activation token (expires 7 days)
    const { activationToken, activationTokenExpiresAt } = newActivationToken();

    // Delivery details the customer entered at checkout (see CheckoutService.saveCheckoutDetails).
    const details = (lead.checkoutDetails ?? {}) as {
      line1?: string;
      city?: string;
      postalCode?: string;
      country?: string;
    };

    // Create or update patient
    const tempPasswordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

    const patient = await this.prisma.patient.upsert({
      where: { email },
      update: { activationToken, activationTokenExpiresAt, ...billing },
      create: {
        email,
        passwordHash: tempPasswordHash,
        firstName: lead.firstName,
        lastName: lead.lastName,
        dateOfBirth: new Date('1990-01-01'), // placeholder — patient sets this on activation
        leadId: lead.id,
        activationToken,
        activationTokenExpiresAt,
        addressLine1: details.line1 || null,
        city: details.city || null,
        postcode: details.postalCode || null,
        country: details.country || null,
        ...billing,
      },
    });

    // Mark lead as converted with a Stripe reference (Checkout Session id, or
    // invoice id for the inline Payment Element flow)
    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        convertedAt: new Date(),
        stripeSessionId: stripeReferenceId,
      },
    });

    this.logger.log(`Patient created/updated for ${email} — patient ${patient.id}`);

    // The medical questionnaire answered on the website becomes the consultation now, so onboarding doesn't
    // ask for it again. If it can't (nothing answered, or it needs redoing) the portal asks as before.
    await this.createConsultationFromLead(email);

    // This lead's first payment just succeeded — the point referral rewards
    // actually get handed out (never at quiz/lead time, to avoid rewarding
    // referrals that never pay).
    await this.referrals.handleConversion(lead, patient, { friendRewardApplied: rewardApplied });

    // Send activation email
    const activationUrl = `${this.appUrl}/activate?token=${activationToken}`;
    await this.email.sendActivationEmail(email, lead.firstName, activationUrl);

    this.logger.log(`Activation email sent to ${email}`);
  }
}

function stripeId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id);
  return null;
}
