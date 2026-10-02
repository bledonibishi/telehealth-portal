import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export type BillingPatient = {
  email: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type RefundOutcome =
  | { status: 'REFUNDED'; subscriptionId: string; refundId: string | null }
  | { status: 'NOT_REQUIRED'; reason: string }
  | { status: 'FAILED'; error: string };

// Patients pay up front at checkout, before any clinician has reviewed them.
// When a clinician declines, this undoes that: the subscription is cancelled so
// it never renews, and its paid invoice is refunded.
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe;
  private configured: boolean;

  constructor(config: ConfigService) {
    const secretKey = config.get<string>('STRIPE_SECRET_KEY');
    this.configured = Boolean(secretKey);
    this.stripe = new Stripe(secretKey ?? '', { apiVersion: '2023-10-16' as any });
  }

  /**
   * A one-time link to Stripe's customer portal, where the patient updates their card, reads past
   * invoices, or cancels. The customer is always the patient's own — never one named by a request.
   * What the portal offers (invoices, cancelling, …) is switched on in the Stripe Dashboard
   * under Settings → Billing → Customer portal.
   */
  async createPortalSession(patient: BillingPatient, returnUrl: string): Promise<string> {
    if (!this.configured) throw new ServiceUnavailableException('Subscription management isn’t available right now. Please message us and we’ll help.');
    const customerId = patient.stripeCustomerId ?? (await this.findCustomerIdByEmail(patient.email));
    if (!customerId) throw new NotFoundException('We couldn’t find a subscription on your account. Please message us and we’ll help.');
    try {
      const session = await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return session.url;
    } catch (err: any) {
      // Typically: the portal hasn't been configured in the Stripe Dashboard yet.
      this.logger.error(`Billing portal session for ${patient.email} failed: ${err.message}`);
      throw new ServiceUnavailableException('Subscription management isn’t available right now. Please message us and we’ll help.');
    }
  }

  async cancelAndRefund(patient: BillingPatient): Promise<RefundOutcome> {
    if (!this.configured) return { status: 'FAILED', error: 'Stripe is not configured' };

    try {
      const subscriptionId = patient.stripeSubscriptionId ?? (await this.findSubscriptionByEmail(patient.email));
      if (!subscriptionId) return { status: 'NOT_REQUIRED', reason: 'No Stripe subscription found for patient' };

      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.status !== 'canceled') {
        await this.stripe.subscriptions.cancel(subscriptionId);
      }

      const refundId = await this.refundLatestPaidInvoice(subscriptionId);
      this.logger.log(`Cancelled ${subscriptionId}, refund ${refundId ?? 'none needed'}`);
      return { status: 'REFUNDED', subscriptionId, refundId };
    } catch (err: any) {
      this.logger.error(`Refund for ${patient.email} failed: ${err.message}`);
      return { status: 'FAILED', error: err.message };
    }
  }

  // The follow-ups below run after a check-in review. Each returns a short note
  // for the review record rather than throwing: the clinical decision stands
  // even if billing needs fixing by hand.

  /** Moves the subscription to another plan from the next billing cycle. */
  async changePrice(patient: BillingPatient, priceId: string): Promise<string> {
    return this.withSubscription(patient, async (sub) => {
      const item = sub.items.data[0];
      if (!item) return 'Subscription has no items — update the plan in Stripe by hand';
      if (item.price.id === priceId) return 'Plan unchanged';
      await this.stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: 'none',
      });
      return `Plan changed to ${priceId} from the next billing cycle`;
    });
  }

  /** Skips charging while treatment is on hold. */
  async pause(patient: BillingPatient): Promise<string> {
    return this.withSubscription(patient, async (sub) => {
      await this.stripe.subscriptions.update(sub.id, { pause_collection: { behavior: 'void' } });
      return 'Billing paused';
    });
  }

  /** Clears a pause when treatment carries on. */
  async resume(patient: BillingPatient): Promise<string> {
    return this.withSubscription(patient, async (sub) => {
      if (!sub.pause_collection) return 'Billing active';
      // An empty value clears the pause (Stripe's convention for unsetting).
      await this.stripe.subscriptions.update(sub.id, { pause_collection: '' as any });
      return 'Billing resumed';
    });
  }

  /** Ends the subscription once the period already paid for runs out. */
  async cancelAtPeriodEnd(patient: BillingPatient): Promise<string> {
    return this.withSubscription(patient, async (sub) => {
      await this.stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      return 'Subscription cancels at the end of the current period';
    });
  }

  private async withSubscription(
    patient: BillingPatient,
    fn: (sub: Stripe.Subscription) => Promise<string>,
  ): Promise<string> {
    if (!this.configured) return 'Stripe is not configured — update billing by hand';
    try {
      const id = patient.stripeSubscriptionId ?? (await this.findSubscriptionByEmail(patient.email));
      if (!id) return 'No Stripe subscription found for this patient';
      const sub = await this.stripe.subscriptions.retrieve(id);
      if (sub.status === 'canceled') return 'Subscription is already cancelled';
      return await fn(sub);
    } catch (err: any) {
      this.logger.error(`Billing update for ${patient.email} failed: ${err.message}`);
      return `Billing update failed (${err.message}) — fix in Stripe by hand`;
    }
  }

  private async refundLatestPaidInvoice(subscriptionId: string): Promise<string | null> {
    const { data } = await this.stripe.invoices.list({ subscription: subscriptionId, status: 'paid', limit: 1 });
    // Cast: the SDK's types target a newer API version than the '2023-10-16'
    // this app pins, where these invoice fields have moved.
    const invoice = data[0] as any;
    if (!invoice || !invoice.amount_paid) return null;

    const target = invoice.payment_intent
      ? { payment_intent: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent.id }
      : invoice.charge
        ? { charge: typeof invoice.charge === 'string' ? invoice.charge : invoice.charge.id }
        : null;
    if (!target) return null;

    try {
      const refund = await this.stripe.refunds.create(target, { idempotencyKey: `decline-refund-${invoice.id}` });
      return refund.id;
    } catch (err: any) {
      // Retried declines (or a manual refund in the dashboard) hit this — already done.
      if (err?.code === 'charge_already_refunded') return null;
      throw err;
    }
  }

  // Patients who paid before stripe ids were recorded on the patient row.
  private async findCustomerIdByEmail(email: string): Promise<string | null> {
    const customers = await this.stripe.customers.list({ email, limit: 1 });
    return customers.data[0]?.id ?? null;
  }

  private async findSubscriptionByEmail(email: string): Promise<string | null> {
    const customerId = await this.findCustomerIdByEmail(email);
    if (!customerId) return null;
    const subs = await this.stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 1 });
    return subs.data[0]?.id ?? null;
  }
}
