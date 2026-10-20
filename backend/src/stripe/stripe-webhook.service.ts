import { AppointmentsService } from '../appointments/appointments.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ReferralsService } from '../referrals/referrals.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { newActivationToken } from '../auth/activation-token';
import { ConsultationsService } from '../consultations/consultations.service';
import { OrdersService } from '../prescriptions/orders.service';
import { NotifierService } from '../notifications/notifier.service';
import { NotificationKind } from '@telehealth/shared-types';
import { feeInInvoice } from './prescription-fee';

/** An approved ID check older than this is asked for again when the patient comes back. */
export const ID_CHECK_MAX_AGE_DAYS = 365;

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
          { amount: session.amount_total ?? 0, currency: session.currency ?? 'eur', reference: null, paidAt: new Date((session.created ?? Date.now() / 1000) * 1000) },
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
        // A supply a patient paid for on its own invoice: release that order to the pharmacy. Not an activation.
        if (invoice.metadata?.kind === 'SUPPLY') {
          const released = await this.moduleRef.get(OrdersService, { strict: false }).markPaid(invoice.id);
          this.logger.log(released ? `Supply invoice ${invoice.id} paid: order released` : `Supply invoice ${invoice.id} paid: nothing waiting for it`);
          break;
        }
        // A returning patient's first month on a new subscription: release the order they were waiting on. Not an activation.
        const returned = (invoice as any).subscription_details?.metadata;
        if (returned?.kind === 'RETURN_SUBSCRIPTION' && returned.returnOrderId) {
          const released = await this.moduleRef.get(OrdersService, { strict: false }).markReturnSubscribed(returned.returnOrderId, stripeId(invoice.subscription), stripeId(invoice.customer));
          this.logger.log(released ? `Return subscription ${stripeId(invoice.subscription)} paid: order released` : `Return subscription paid: nothing waiting for it`);
          break;
        }
        // An extra consultation the patient paid for: it now goes to the doctors. Not an activation.
        if (invoice.metadata?.kind === 'CONSULT') {
          const released = await this.moduleRef.get(AppointmentsService, { strict: false }).markPaid(invoice.id);
          this.logger.log(released ? `Consultation invoice ${invoice.id} paid: request released` : `Consultation invoice ${invoice.id} paid: nothing waiting for it`);
          break;
        }
        // A payment that went through ends any hold a failed one put on the patient's supplies.
        const paidBy = stripeId(invoice.customer);
        if (paidBy) await this.prisma.patient.updateMany({ where: { stripeCustomerId: paidBy, paymentFailedAt: { not: null } }, data: { paymentFailedAt: null } });
        const discountCents = ((invoice as any).total_discount_amounts ?? []).reduce(
          (sum: number, d: { amount: number }) => sum + d.amount,
          0,
        );
        await this.activatePatient(
          invoice.customer_email,
          invoice.id,
          { customerId: stripeId(invoice.customer), subscriptionId: stripeId(invoice.subscription), paysPerSupply: invoice.metadata?.billing === 'ONE_TIME', prescriptionFeeCents: feeInInvoice(invoice as any) },
          discountCents > 0,
          { amount: invoice.amount_paid ?? 0, currency: invoice.currency ?? 'eur', reference: invoice.number ?? null, paidAt: new Date((invoice.status_transitions?.paid_at ?? invoice.created ?? Date.now() / 1000) * 1000) },
        );
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: unknown };
        // A supply a patient chose to pay for is theirs to pay again; only a renewal that failed holds their supplies.
        if (invoice.metadata?.kind === 'SUPPLY' || invoice.metadata?.kind === 'CONSULT' || !invoice.subscription) break;
        await this.holdForFailedPayment(stripeId(invoice.customer), stripeId(invoice.subscription));
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

  /**
   * A renewal was declined: hold the patient's further supplies and ask them to update their card. Only the first failure
   * of a run counts (Stripe tries again for days and tells us each time), so they are not emailed every attempt. A first
   * payment that fails belongs to no patient yet and is ignored: the checkout page shows that one.
   */
  private async holdForFailedPayment(customerId: string | null, subscriptionId: string | null) {
    const patient = await this.prisma.patient.findFirst({
      where: { OR: [...(customerId ? [{ stripeCustomerId: customerId }] : []), ...(subscriptionId ? [{ stripeSubscriptionId: subscriptionId }] : [])] },
      select: { id: true, email: true, firstName: true },
    });
    if (!patient) return;
    const { count } = await this.prisma.patient.updateMany({ where: { id: patient.id, paymentFailedAt: null }, data: { paymentFailedAt: new Date() } });
    if (count === 0) return;
    this.logger.warn(`A payment for patient ${patient.id} failed: further supplies are held until one succeeds`);
    await this.audit.log({ actorId: 'system:stripe', actorRole: UserRole.ADMIN, action: 'PAYMENT_FAILED', resourceType: 'Patient', resourceId: patient.id, metadata: { subscriptionId } });
    await this.moduleRef.get(NotifierService, { strict: false }).toPatient(patient.id, { kind: NotificationKind.PAYMENT_FAILED, href: '/settings', groupKey: `payment-failed:${patient.id}` }).catch((err: any) => this.logger.error(`Telling ${patient.id} about a failed payment failed: ${err?.message}`));
    await this.email.sendPaymentFailedEmail(patient.email, patient.firstName, `${this.appUrl}/settings`).catch((err: any) => this.logger.error(`Payment failed email to ${patient.email} failed: ${err?.message}`));
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

  /**
   * An ID check older than a year is asked for again: the onboarding goes back to in progress with the ID step open (the body
   * photos stay). Returns whether that happened.
   */
  private async expireOldIdCheck(tx: Prisma.TransactionClient, email: string): Promise<boolean> {
    const patient = await tx.patient.findUnique({ where: { email }, select: { id: true } });
    if (!patient) return false;
    const { count } = await tx.onboardingSubmission.updateMany({
      where: { patientId: patient.id, status: 'APPROVED', reviewedAt: { lt: new Date(Date.now() - ID_CHECK_MAX_AGE_DAYS * 86_400_000) } },
      data: { status: 'IN_PROGRESS', idDocumentFileId: null, selfieFileId: null, personaStatus: 'NOT_STARTED' },
    });
    return count > 0;
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
    stripeIds: { customerId: string | null; subscriptionId: string | null; /** Paid once, not on a subscription: each later supply is paid for on its own. */ paysPerSupply?: boolean; /** The fee the first payment charged, in cents. */ prescriptionFeeCents?: number },
    rewardApplied: boolean,
    payment: { amount: number; currency: string; reference: string | null; paidAt: Date },
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
      ...(stripeIds.paysPerSupply && { paysPerSupply: true }),
      // A patient whose first payment carried the fee pays it with every new prescription; others never do.
      ...(stripeIds.prescriptionFeeCents ? { prescriptionFeePaidCents: stripeIds.prescriptionFeeCents } : {}),
    };

    // Idempotency: if already converted, skip (also covers subscription renewal invoices)
    const skipAlreadyConverted = async () => {
      // Still backfill billing ids — a declined consultation needs them to refund.
      if (Object.keys(billing).length) {
        await this.prisma.patient.updateMany({ where: { email }, data: billing });
      }
      // A payment event after the first (renewals, the second event of one payment) is another chance to turn the
      // website answers into the consultation if that failed the first time. Harmless when it already exists.
      await this.createConsultationFromLead(email);
      this.logger.log(`Lead ${lead.id} already converted — skipping`);
    };
    if (lead.convertedAt) return skipAlreadyConverted();

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

    // Claiming the lead and creating the patient are one step: when the two events of a payment (the checkout session
    // and its invoice) arrive together, only one gets through, so there is one activation link and one receipt.
    // Marked with a Stripe reference (Checkout Session id, or invoice id for the inline Payment Element flow).
    // Someone who already has an activated account (refunded or lapsed, now back) keeps it: their sign-in, their records, and
    // their ID check unless it has gone stale. They get a welcome back, not an activation link that would reset their password.
    let returning = false;
    let idCheckNeeded = false;
    const patient = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.lead.updateMany({ where: { id: lead.id, convertedAt: null }, data: { convertedAt: new Date(), stripeSessionId: stripeReferenceId } });
      if (claimed.count === 0) return null;
      const before = await tx.patient.findUnique({ where: { email }, select: { activatedAt: true } });
      returning = !!before?.activatedAt;
      if (returning) idCheckNeeded = await this.expireOldIdCheck(tx, email);
      return tx.patient.upsert({
        where: { email },
        // Someone refunded and closed earlier who starts over is a patient again; a new delivery address replaces the old one.
        update: {
          ...(returning ? {} : { activationToken, activationTokenExpiresAt }),
          accessClosedAt: null, accessClosedReason: null, subscriptionEndedAt: null, lapsedEmailsSent: 0, lapsedEmailAt: null,
          ...(details.line1 && details.city && details.postalCode && details.country && { addressLine1: details.line1, city: details.city, postcode: details.postalCode, country: details.country }),
          ...billing,
        },
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
    });
    if (!patient) return skipAlreadyConverted();

    this.logger.log(`Patient created/updated for ${email} — patient ${patient.id}`);

    // The receipt goes first, on its own: the steps below can fail (and the payment is then retried, but only once
    // by this point converted), and a patient who paid must not be left without it. Nothing to confirm for a payment
    // of nothing (a fully discounted first month).
    if (payment.amount > 0) {
      try {
        await this.email.sendPaymentReceiptEmail(email, lead.firstName, payment);
      } catch (err: any) {
        this.logger.error(`Payment receipt email to ${email} failed: ${err?.message}`);
      }
    }

    // The medical questionnaire answered on the website becomes the consultation now, so onboarding doesn't
    // ask for it again. If it can't (nothing answered, or it needs redoing) the portal asks as before.
    await this.createConsultationFromLead(email);

    // This lead's first payment just succeeded — the point referral rewards
    // actually get handed out (never at quiz/lead time, to avoid rewarding
    // referrals that never pay).
    await this.referrals.handleConversion(lead, patient, { friendRewardApplied: rewardApplied });

    if (returning) {
      await this.email.sendWelcomeBackEmail(email, lead.firstName, { signInUrl: `${this.appUrl}/login`, resetUrl: `${this.appUrl}/forgot-password`, idCheckNeeded });
      this.logger.log(`Welcome back email sent to ${email}`);
      return;
    }

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
