import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export type BillingPatient = {
  email: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type InvoiceSummary = {
  id: string;
  createdAt: Date;
  amountCents: number;
  currency: string;
  /** PAID, or UNPAID while a payment is still owed (including a failed attempt). */
  status: 'PAID' | 'UNPAID';
  description: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  /** Stripe's own invoice page, and a PDF of it. */
  viewUrl: string | null;
  pdfUrl: string | null;
};

export const INVOICE_LIMIT = 12;

/** What a billing action did: `ok` only when it really happened. */
export type BillingResult = { ok: boolean; note: string };

export type RefundOutcome =
  | { status: 'REFUNDED'; subscriptionId: string; refundId: string | null }
  | { status: 'NOT_REQUIRED'; reason: string }
  | { status: 'FAILED'; error: string };

type PriceLine = { price: string; quantity: number };

/** One price or several (the same price twice becomes quantity 2) as subscription lines. */
export function toLines(priceIds: string | string[]): PriceLine[] {
  const counts = new Map<string, number>();
  for (const id of Array.isArray(priceIds) ? priceIds : [priceIds]) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([price, quantity]) => ({ price, quantity }));
}

type ExistingItem = { id: string; quantity?: number; price: { id: string } };

const sameLines = (existing: ExistingItem[], lines: PriceLine[]) =>
  existing.length === lines.length && lines.every((l) => existing.some((i) => i.price.id === l.price && (i.quantity ?? 1) === l.quantity));

/**
 * What to send Stripe to turn the subscription's items into `lines`: items already on the right price are
 * kept, a different one is swapped in place, and any left over are added or removed.
 */
function itemsUpdate(existing: ExistingItem[], lines: PriceLine[]): Stripe.SubscriptionUpdateParams.Item[] {
  const update: Stripe.SubscriptionUpdateParams.Item[] = [];
  const remaining = [...lines];
  const spare: ExistingItem[] = [];
  for (const item of existing) {
    const i = remaining.findIndex((l) => l.price === item.price.id);
    if (i < 0) {
      spare.push(item);
      continue;
    }
    const [line] = remaining.splice(i, 1);
    if ((item.quantity ?? 1) !== line.quantity) update.push({ id: item.id, quantity: line.quantity });
  }
  for (const item of spare) {
    const line = remaining.shift();
    if (!line) update.push({ id: item.id, deleted: true });
    else update.push({ id: item.id, price: line.price, ...(line.quantity !== (item.quantity ?? 1) ? { quantity: line.quantity } : {}) });
  }
  for (const line of remaining) update.push({ price: line.price, ...(line.quantity !== 1 ? { quantity: line.quantity } : {}) });
  return update;
}

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

  /**
   * The patient's most recent payments, newest first, with a link to each invoice's PDF. Drafts and voided
   * invoices are never shown. The customer is always the patient's own. Empty when there is nothing to show
   * (Stripe not set up, or no customer yet).
   */
  async listInvoices(patient: BillingPatient): Promise<InvoiceSummary[]> {
    if (!this.configured) return [];
    try {
      const customerId = patient.stripeCustomerId ?? (await this.findCustomerIdByEmail(patient.email));
      if (!customerId) return [];
      // Drafts and voids are filtered out below, so ask for more than we show.
      const { data } = await this.stripe.invoices.list({ customer: customerId, limit: INVOICE_LIMIT * 2, expand: ['data.charge'] });
      return data
        .filter((i) => i.status === 'paid' || i.status === 'open' || i.status === 'uncollectible')
        .slice(0, INVOICE_LIMIT)
        .map((i) => {
          // Requests are pinned to API version 2023-10-16, where an invoice has a `charge` we expanded above;
          // this SDK's types describe a newer API without it.
          const charge = (i as unknown as { charge?: Stripe.Charge | string | null }).charge;
          const card = typeof charge === 'object' && charge ? charge.payment_method_details?.card ?? null : null;
          return {
            id: i.id,
            createdAt: new Date(i.created * 1000),
            amountCents: i.status === 'paid' ? i.amount_paid : i.amount_due,
            currency: i.currency.toUpperCase(),
            status: i.status === 'paid' ? 'PAID' : 'UNPAID',
            description: i.lines?.data?.[0]?.description ?? null,
            cardBrand: card?.brand ?? null,
            cardLast4: card?.last4 ?? null,
            viewUrl: i.hosted_invoice_url ?? null,
            pdfUrl: i.invoice_pdf ?? null,
          };
        });
    } catch (err: any) {
      this.logger.error(`Listing invoices for ${patient.email} failed: ${err.message}`);
      throw new ServiceUnavailableException('We couldn’t load your payments right now. Please try again in a moment.');
    }
  }

  async cancelAndRefund(patient: BillingPatient, opts: { paidBefore?: Date } = {}): Promise<RefundOutcome> {
    if (!this.configured) return { status: 'FAILED', error: 'Stripe is not configured' };

    try {
      const subscriptionId = patient.stripeSubscriptionId ?? (await this.findSubscriptionByEmail(patient.email));
      if (!subscriptionId) return { status: 'NOT_REQUIRED', reason: 'No Stripe subscription found for patient' };

      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.status !== 'canceled') {
        await this.stripe.subscriptions.cancel(subscriptionId);
      }

      const refundId = await this.refundLatestPaidInvoice(subscriptionId, opts.paidBefore);
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

  /** Moves the subscription to another plan (one or more prices) from the next billing cycle. */
  async changePrice(patient: BillingPatient, priceIds: string | string[]): Promise<string> {
    const lines = toLines(priceIds);
    return this.withSubscription(patient, async (sub) => {
      if (sub.items.data.length === 0) return 'Subscription has no items — update the plan in Stripe by hand';
      if (sameLines(sub.items.data, lines)) return 'Plan unchanged';
      await this.stripe.subscriptions.update(sub.id, { items: itemsUpdate(sub.items.data, lines), proration_behavior: 'none' });
      return `Plan changed to ${lines.map((l) => l.price).join(' + ')} from the next billing cycle`;
    });
  }

  /**
   * After the first prescription: bill the medicines that were prescribed rather than the ones ordered.
   * The subscription moves to `priceIds` (one line per medicine) from the next billing cycle; if the new
   * total is lower, the difference on the payment already made is refunded to the card. The plan is never
   * moved to a total that is higher than what the patient agreed to at checkout (or can't be compared
   * with it): that needs the patient's agreement, so it is left as a note to sort out by hand.
   * Returns a note for the record, never throws.
   */
  async moveToPrescribedPrice(patient: BillingPatient, priceIds: string | string[], doseLabel?: string): Promise<string> {
    const lines = toLines(priceIds);
    return this.withSubscription(patient, async (sub) => {
      const existing = sub.items.data;
      if (existing.length === 0) return 'Subscription has no items — update the plan in Stripe by hand';
      if (sameLines(existing, lines)) return 'Billing already matches the prescribed dose';

      const currency = existing[0].price.currency;
      const oldAmount = existing.every((i) => i.price.unit_amount != null)
        ? existing.reduce((sum, i) => sum + i.price.unit_amount! * (i.quantity ?? 1), 0)
        : null;
      const newPrices = await Promise.all(lines.map((l) => this.stripe.prices.retrieve(l.price)));
      const newAmount = newPrices.every((p) => p.unit_amount != null)
        ? newPrices.reduce((sum, p, i) => sum + p.unit_amount! * lines[i].quantity, 0)
        : null;
      const label = doseLabel ?? lines.map((l) => l.price).join(' + ');
      if (oldAmount == null || newAmount == null || newPrices.some((p) => p.currency !== currency)) {
        return `Billing unchanged: the price for ${label} can’t be compared with the current plan — check it in Stripe`;
      }
      if (newAmount > oldAmount) {
        return `Billing unchanged: ${label} costs more than the plan the patient paid for — agree the new price with them before changing it in Stripe`;
      }
      await this.stripe.subscriptions.update(sub.id, { items: itemsUpdate(existing, lines), proration_behavior: 'none' });
      const moved = `Billing moved to ${label} from the next billing cycle`;
      if (newAmount === oldAmount) return moved;

      const { data } = await this.stripe.invoices.list({ subscription: sub.id, status: 'paid', limit: 1 });
      const invoice = data[0] as any; // see refundLatestPaidInvoice on the cast
      if (!invoice?.amount_paid) return `${moved}; no paid invoice to refund`;
      // Scaled to what was actually paid, so a discount applied at checkout is shared fairly.
      const refundCents = Math.round(((oldAmount - newAmount) * invoice.amount_paid) / oldAmount);
      const target = this.paymentOf(invoice);
      if (!target || refundCents <= 0) return `${moved}; refund the difference by hand`;
      const priceKey = lines.map((l) => l.price).join('+');
      try {
        const refund = await this.stripe.refunds.create(
          { ...target, amount: refundCents, metadata: { reason: 'prescribed_dose_cheaper', priceId: priceKey } },
          { idempotencyKey: `dose-price-refund-${invoice.id}-${priceKey}` },
        );
        return `${moved}; refunded ${(refundCents / 100).toFixed(2)} ${invoice.currency?.toUpperCase() ?? ''} for this month (${refund.id})`;
      } catch (err: any) {
        if (err?.code === 'charge_already_refunded') return `${moved}; payment was already refunded`;
        throw err;
      }
    });
  }

  /**
   * Refunds the patient's latest paid invoice and leaves the subscription running (an order that couldn't be supplied
   * isn't always the end of treatment). Returns a note for the record, never throws.
   */
  async refundLatestPayment(patient: BillingPatient, opts: { paidBefore?: Date } = {}): Promise<string> {
    return (await this.refundLatestPaymentResult(patient, opts)).note;
  }

  /**
   * Like refundLatestPayment, but says whether money was actually refunded, so a caller never reports a refund that
   * did not happen. `paidBefore` limits it to payments made up to then (an order's own payment, not a later bill).
   */
  async refundLatestPaymentResult(patient: BillingPatient, opts: { paidBefore?: Date } = {}): Promise<BillingResult> {
    return this.withSubscriptionResult(patient, async (sub) => {
      const refundId = await this.refundLatestPaidInvoice(sub.id, opts.paidBefore);
      return refundId
        ? { ok: true, note: `Refunded the latest payment (${refundId})` }
        : { ok: false, note: 'Nothing to refund: there is no paid payment, or it was already refunded' };
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
    return (await this.cancelAtPeriodEndResult(patient)).note;
  }

  /** Like cancelAtPeriodEnd, but says whether the subscription now really ends, so a failure is never shown as success. */
  async cancelAtPeriodEndResult(patient: BillingPatient): Promise<BillingResult> {
    return this.withSubscriptionResult(
      patient,
      async (sub) => {
        if (sub.cancel_at_period_end) return { ok: true, note: 'Subscription already ends after the period that is paid for' };
        await this.stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
        return { ok: true, note: 'Subscription cancels at the end of the current period' };
      },
      { alreadyCancelledIsOk: true },
    );
  }

  private async withSubscription(patient: BillingPatient, fn: (sub: Stripe.Subscription) => Promise<string>): Promise<string> {
    return (await this.withSubscriptionResult(patient, async (sub) => ({ ok: true, note: await fn(sub) }))).note;
  }

  /** Finds the patient's subscription and runs `fn` on it. Never throws: a problem comes back as `ok: false` with a note. */
  private async withSubscriptionResult(
    patient: BillingPatient,
    fn: (sub: Stripe.Subscription) => Promise<BillingResult>,
    opts: { alreadyCancelledIsOk?: boolean } = {},
  ): Promise<BillingResult> {
    if (!this.configured) return { ok: false, note: 'Stripe is not configured — update billing by hand' };
    try {
      const id = patient.stripeSubscriptionId ?? (await this.findSubscriptionByEmail(patient.email));
      if (!id) return { ok: false, note: 'No Stripe subscription found for this patient' };
      const sub = await this.stripe.subscriptions.retrieve(id);
      if (sub.status === 'canceled') return { ok: !!opts.alreadyCancelledIsOk, note: 'Subscription is already cancelled' };
      return await fn(sub);
    } catch (err: any) {
      this.logger.error(`Billing update for ${patient.email} failed: ${err.message}`);
      return { ok: false, note: `Billing update failed (${err.message}) — fix in Stripe by hand` };
    }
  }

  private async refundLatestPaidInvoice(subscriptionId: string, paidBefore?: Date): Promise<string | null> {
    // Cast: the SDK's types target a newer API version than the '2023-10-16'
    // this app pins, where these invoice fields have moved.
    const { data } = await this.stripe.invoices.list({ subscription: subscriptionId, status: 'paid', limit: paidBefore ? 20 : 1 });
    const paidAt = (i: any) => (i.status_transitions?.paid_at ?? i.created ?? 0) * 1000;
    const invoice = (paidBefore ? (data as any[]).find((i) => paidAt(i) <= paidBefore.getTime()) : data[0]) as any;
    if (!invoice || !invoice.amount_paid) return null;

    const target = this.paymentOf(invoice);
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

  private paymentOf(invoice: any): { payment_intent: string } | { charge: string } | null {
    if (invoice.payment_intent) {
      return { payment_intent: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent.id };
    }
    if (invoice.charge) return { charge: typeof invoice.charge === 'string' ? invoice.charge : invoice.charge.id };
    return null;
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
