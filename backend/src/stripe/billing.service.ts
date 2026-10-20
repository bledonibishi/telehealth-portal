import { CONSULT_FEE_LABEL } from '../appointments/consult-fee';
import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { EmailService } from '../email/email.service';
import { subscriptionAmount } from './billing-choice';
import { PRESCRIPTION_FEE_LABEL, feeApplies, feeInInvoice } from './prescription-fee';

export type BillingPatient = {
  email: string;
  /** For the greeting in emails; the refund email still goes out without it. */
  firstName?: string | null;
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
  | { status: 'REFUNDED'; /** Null for a patient who paid once: there is no subscription. */ subscriptionId: string | null; refundId: string | null }
  | { status: 'NOT_REQUIRED'; reason: string }
  | { status: 'FAILED'; error: string };

type PriceLine = { price: string; quantity: number };

/** One price or several (the same price twice becomes quantity 2) as subscription lines. */
export function toLines(priceIds: string | string[]): PriceLine[] {
  const counts = new Map<string, number>();
  for (const id of Array.isArray(priceIds) ? priceIds : [priceIds]) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([price, quantity]) => ({ price, quantity }));
}

type ExistingItem = {
  id: string;
  quantity?: number;
  price: { id: string; product?: string | { id: string }; unit_amount?: number | null; currency?: string };
};

/**
 * What a subscription line should be: a Stripe price as it is, or — for a subscription bought at the subscriber's
 * discount — the same product at the discounted amount (an inline price, as at checkout), so a change of dose
 * keeps the 10% instead of going back to the full price.
 */
type LineSpec = {
  quantity: number;
  price?: string;
  price_data?: Stripe.SubscriptionUpdateParams.Item.PriceData;
  /** What one unit costs (cents) and in which currency, when known. */
  unitAmount?: number | null;
  currency?: string;
};

const productIdOf = (product: string | { id: string } | undefined) => (typeof product === 'string' ? product : product?.id);

/** The monthly prescription fee line of a subscription: it is billed alongside the medicine, never swapped with it. */
const isFeeItem = (item: { price?: { product?: unknown } }) => {
  const product = item.price?.product as { name?: string } | string | undefined;
  return typeof product === 'object' && product !== null && product.name === PRESCRIPTION_FEE_LABEL;
};

const matches = (item: ExistingItem, spec: LineSpec) =>
  spec.price_data
    ? productIdOf(item.price.product) === spec.price_data.product && item.price.unit_amount === spec.price_data.unit_amount && item.price.currency === spec.price_data.currency
    : item.price.id === spec.price;

const sameLines = (existing: ExistingItem[], specs: LineSpec[]) =>
  existing.length === specs.length && specs.every((l) => existing.some((i) => matches(i, l) && (i.quantity ?? 1) === l.quantity));

const itemOf = (spec: LineSpec): { price?: string; price_data?: Stripe.SubscriptionUpdateParams.Item.PriceData } =>
  spec.price_data ? { price_data: spec.price_data } : { price: spec.price };

/**
 * What to send Stripe to turn the subscription's items into `specs`: items already on the right price are
 * kept, a different one is swapped in place, and any left over are added or removed.
 */
function itemsUpdate(existing: ExistingItem[], specs: LineSpec[]): Stripe.SubscriptionUpdateParams.Item[] {
  const update: Stripe.SubscriptionUpdateParams.Item[] = [];
  const remaining = [...specs];
  const spare: ExistingItem[] = [];
  for (const item of existing) {
    const i = remaining.findIndex((l) => matches(item, l));
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
    else update.push({ id: item.id, ...itemOf(line), ...(line.quantity !== (item.quantity ?? 1) ? { quantity: line.quantity } : {}) });
  }
  for (const line of remaining) update.push({ ...itemOf(line), ...(line.quantity !== 1 ? { quantity: line.quantity } : {}) });
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

  constructor(
    config: ConfigService,
    private email?: EmailService,
  ) {
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

  /**
   * Tells the patient a refund went out. Only for a refund made just now (an already-refunded payment has no refund id and a replayed request is marked,
   * so a retry can't send a second email), and never throws: the money has moved whether or not the email goes.
   */
  private notifyRefund(patient: BillingPatient, refund: { refundId: string | null; amount?: number; currency?: string; replayed?: boolean }) {
    if (!this.email || refund.replayed || !refund.refundId || !refund.amount || !refund.currency) return;
    this.email
      .sendRefundEmail(patient.email, patient.firstName, { amount: refund.amount, currency: refund.currency })
      .catch((err: any) => this.logger.error(`Refund email to ${patient.email} failed: ${err?.message}`));
  }

  async cancelAndRefund(patient: BillingPatient, opts: { paidBefore?: Date; prescriptionIssuedAt?: Date | null } = {}): Promise<RefundOutcome> {
    if (!this.configured) return { status: 'FAILED', error: 'Stripe is not configured' };

    try {
      const subscriptionId = patient.stripeSubscriptionId ?? (await this.findSubscriptionByEmail(patient.email));
      if (!subscriptionId) {
        // Someone who paid once has no subscription to end: what they paid is refunded from their own invoices.
        const customerId = patient.stripeCustomerId ?? (await this.findCustomerIdByEmail(patient.email));
        if (!customerId) return { status: 'NOT_REQUIRED', reason: 'No Stripe subscription or customer found for patient' };
        const once = await this.refundLatestPaidInvoice({ customerId }, opts.paidBefore, opts);
        if (!once.paid) return { status: 'NOT_REQUIRED', reason: 'The patient paid once and has no subscription; no payment was taken, so there is nothing to refund' };
        this.notifyRefund(patient, once);
        return { status: 'REFUNDED', subscriptionId: null, refundId: once.refundId };
      }

      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.status !== 'canceled') {
        await this.stripe.subscriptions.cancel(subscriptionId);
      }

      const { paid, refundId, amount, currency, replayed } = await this.refundLatestPaidInvoice({ subscriptionId }, opts.paidBefore, opts);
      this.logger.log(`Cancelled ${subscriptionId}, refund ${refundId ?? 'none needed'}`);
      // Only reported as refunded when money was charged: a subscription that never took a payment (or a
      // 100%-discounted one) is cancelled with nothing to give back, and must not read as a refund.
      if (!paid) return { status: 'NOT_REQUIRED', reason: 'The subscription was cancelled; no payment had been taken, so there is nothing to refund' };
      this.notifyRefund(patient, { refundId, amount, currency, replayed });
      return { status: 'REFUNDED', subscriptionId, refundId };
    } catch (err: any) {
      this.logger.error(`Refund for ${patient.email} failed: ${err.message}`);
      return { status: 'FAILED', error: err.message };
    }
  }

  // The follow-ups below run after a check-in review. Each returns a short note
  // for the review record rather than throwing: the clinical decision stands
  // even if billing needs fixing by hand.

  /**
   * The subscription's lines for `lines`. A subscription bought at the subscriber's price (its metadata says so)
   * keeps that discount: the new dose is billed at the same share of its full price. Any other subscription is
   * moved to the prices as they are. `prices` are the Stripe prices of `lines`, when the caller has them already.
   */
  private async specsFor(sub: Stripe.Subscription, lines: PriceLine[], prices?: Stripe.Price[]): Promise<LineSpec[]> {
    if (sub.metadata?.billing !== 'SUBSCRIPTION') return lines.map((l) => ({ price: l.price, quantity: l.quantity }));
    const found = prices ?? (await Promise.all(lines.map((l) => this.stripe.prices.retrieve(l.price))));
    return found.map((p, i) => {
      if (p.unit_amount == null || p.recurring?.interval !== 'month') throw new Error(`${p.id} is not a monthly price, so it can’t be billed on a subscription`);
      const unit = subscriptionAmount(p.unit_amount);
      const product = productIdOf(p.product as string | { id: string })!;
      return { quantity: lines[i].quantity, unitAmount: unit, currency: p.currency, price_data: { currency: p.currency, product, unit_amount: unit, recurring: { interval: 'month' as const } } };
    });
  }

  /** Moves the subscription to another plan (one or more prices) from the next billing cycle. */
  async changePrice(patient: BillingPatient, priceIds: string | string[]): Promise<string> {
    const lines = toLines(priceIds);
    return this.withSubscription(patient, async (sub) => {
      // The prescription fee line stays as it is: only the medicine's lines move to the new dose.
      const medicine = sub.items.data.filter((i) => !isFeeItem(i));
      if (medicine.length === 0) return 'Subscription has no items — update the plan in Stripe by hand';
      const specs = await this.specsFor(sub, lines);
      if (sameLines(medicine, specs)) return 'Plan unchanged';
      await this.stripe.subscriptions.update(sub.id, { items: itemsUpdate(medicine, specs), proration_behavior: 'none' });
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
      const existing = sub.items.data.filter((i) => !isFeeItem(i));
      if (existing.length === 0) return 'Subscription has no items — update the plan in Stripe by hand';
      const newPrices = await Promise.all(lines.map((l) => this.stripe.prices.retrieve(l.price)));
      const specs = await this.specsFor(sub, lines, newPrices);
      if (sameLines(existing, specs)) return 'Billing already matches the prescribed dose';

      const currency = existing[0].price.currency;
      const oldAmount = existing.every((i) => i.price.unit_amount != null)
        ? existing.reduce((sum, i) => sum + i.price.unit_amount! * (i.quantity ?? 1), 0)
        : null;
      // What the patient would pay: at the subscriber's price when that is how they pay, else the price as it is.
      const unitAmounts = specs.map((sp, i) => sp.unitAmount ?? newPrices[i].unit_amount);
      const newAmount = unitAmounts.every((a) => a != null) ? unitAmounts.reduce((sum: number, a, i) => sum + a! * lines[i].quantity, 0) : null;
      const label = doseLabel ?? lines.map((l) => l.price).join(' + ');
      if (oldAmount == null || newAmount == null || newPrices.some((p) => p.currency !== currency)) {
        return `Billing unchanged: the price for ${label} can’t be compared with the current plan — check it in Stripe`;
      }
      if (newAmount > oldAmount) {
        return `Billing unchanged: ${label} costs more than the plan the patient paid for — agree the new price with them before changing it in Stripe`;
      }
      await this.stripe.subscriptions.update(sub.id, { items: itemsUpdate(existing, specs), proration_behavior: 'none' });
      const moved = `Billing moved to ${label} from the next billing cycle`;
      if (newAmount === oldAmount) return moved;

      const { data } = await this.stripe.invoices.list({ subscription: sub.id, status: 'paid', limit: 1 });
      const invoice = data[0] as any; // see refundLatestPaidInvoice on the cast
      if (!invoice?.amount_paid) return `${moved}; no paid invoice to refund`;
      // Scaled to what was actually paid, so a discount applied at checkout is shared fairly.
      // The prescription fee is not part of what the dose costs, so it does not count in the share.
      const refundCents = Math.round(((oldAmount - newAmount) * Math.max(invoice.amount_paid - feeInInvoice(invoice), 0)) / oldAmount);
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
  async refundLatestPayment(patient: BillingPatient, opts: { paidBefore?: Date; prescriptionIssuedAt?: Date | null } = {}): Promise<string> {
    return (await this.refundLatestPaymentResult(patient, opts)).note;
  }

  /**
   * Like refundLatestPayment, but says whether money was actually refunded, so a caller never reports a refund that
   * did not happen. `paidBefore` limits it to payments made up to then (an order's own payment, not a later bill).
   */
  async refundLatestPaymentResult(patient: BillingPatient, opts: { paidBefore?: Date; prescriptionIssuedAt?: Date | null } = {}): Promise<BillingResult> {
    if (this.configured && !(await this.hasSubscription(patient))) return this.refundPaidOnce(patient, opts);
    return this.withSubscriptionResult(patient, async (sub) => {
      const { refundId, amount, currency, replayed, feeKept, onlyFee } = await this.refundLatestPaidInvoice({ subscriptionId: sub.id }, opts.paidBefore, opts);
      this.notifyRefund(patient, { refundId, amount, currency, replayed });
      if (onlyFee) return { ok: false, note: 'Nothing to refund: only the prescription fee was paid, and it isn’t returned' };
      return refundId
        ? { ok: true, note: feeKept ? `Refunded the latest payment except the ${(feeKept / 100).toFixed(2)} prescription fee (${refundId})` : `Refunded the latest payment (${refundId})` }
        : { ok: false, note: 'Nothing to refund: there is no paid payment, or it was already refunded' };
    });
  }

  /**
   * Tries again to collect the patient's newest unpaid invoice, with the card Stripe already holds for them. Never throws:
   * a card that is declined, or nothing owed, comes back as `ok: false` with a note a person can act on.
   */
  async retryUnpaidInvoice(patient: BillingPatient): Promise<BillingResult> {
    if (!this.configured) return { ok: false, note: 'Stripe is not configured — collect the payment by hand' };
    try {
      const customerId = patient.stripeCustomerId ?? (await this.findCustomerIdByEmail(patient.email));
      if (!customerId) return { ok: false, note: 'No Stripe customer found for this patient' };
      const { data } = await this.stripe.invoices.list({ customer: customerId, status: 'open', limit: 1 });
      const invoice = data[0];
      if (!invoice) return { ok: false, note: 'This patient has no unpaid invoice to retry' };
      const paid = await this.stripe.invoices.pay(invoice.id);
      return paid.status === 'paid' ? { ok: true, note: 'The payment went through' } : { ok: false, note: 'The payment did not complete — ask the patient to check their card' };
    } catch (err: any) {
      this.logger.error(`Retrying an invoice for ${patient.email} failed: ${err.message}`);
      return { ok: false, note: err?.type === 'StripeCardError' ? 'The card was declined — the patient needs to update their card' : 'The payment could not be retried — check it in Stripe' };
    }
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

  /** Ends the subscription at once, for a patient who has been refunded: nothing more is taken and no more supplies follow. */
  async cancelNowResult(patient: BillingPatient): Promise<BillingResult> {
    if (this.configured && !(await this.hasSubscription(patient)) && (await this.hasCustomer(patient))) {
      return { ok: true, note: 'Nothing to end: this patient pays once for each supply, so no payment renews' };
    }
    return this.withSubscriptionResult(
      patient,
      async (sub) => {
        await this.stripe.subscriptions.cancel(sub.id);
        return { ok: true, note: 'Subscription ended now' };
      },
      { alreadyCancelledIsOk: true },
    );
  }

  /** Like cancelAtPeriodEnd, but says whether the subscription now really ends, so a failure is never shown as success. */
  async cancelAtPeriodEndResult(patient: BillingPatient): Promise<BillingResult> {
    // Someone who paid once has nothing that renews: there is nothing to stop, and that is not a failure.
    if (this.configured && !(await this.hasSubscription(patient)) && (await this.hasCustomer(patient))) {
      return { ok: true, note: 'Nothing to cancel: this patient pays once for each supply, so no payment renews' };
    }
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
      // The products are expanded so the prescription fee line can be told apart from the medicine.
      const sub = await this.stripe.subscriptions.retrieve(id, { expand: ['items.data.price.product'] });
      if (sub.status === 'canceled') return { ok: !!opts.alreadyCancelledIsOk, note: 'Subscription is already cancelled' };
      return await fn(sub);
    } catch (err: any) {
      this.logger.error(`Billing update for ${patient.email} failed: ${err.message}`);
      return { ok: false, note: `Billing update failed (${err.message}) — fix in Stripe by hand` };
    }
  }

  /**
   * How much of a payment a refund returns: all of it, or — when a prescription was written after the payment — all but the
   * prescription fee, because the doctor's work can't be undone. Never below zero.
   */
  private refundableOf(invoice: any, prescriptionIssuedAt?: Date | null): { amount: number; feeKept: number } {
    const fee = feeInInvoice(invoice);
    const paidAt = (invoice.status_transitions?.paid_at ?? invoice.created ?? 0) * 1000;
    // An hour of slack: the prescription is written after the payment, never before it.
    const written = !!prescriptionIssuedAt && prescriptionIssuedAt.getTime() >= paidAt - 3_600_000;
    const feeKept = fee > 0 && written ? Math.min(fee, invoice.amount_paid ?? 0) : 0;
    return { amount: Math.max((invoice.amount_paid ?? 0) - feeKept, 0), feeKept };
  }

  /** The newest paid invoice in scope (the newest up to `paidBefore`, when given). */
  private async latestPaidInvoice(scope: { subscriptionId?: string; customerId?: string }, paidBefore?: Date): Promise<any | null> {
    // Cast: the SDK's types target a newer API version than the '2023-10-16'
    // this app pins, where these invoice fields have moved.
    const { data } = await this.stripe.invoices.list({ ...(scope.subscriptionId ? { subscription: scope.subscriptionId } : { customer: scope.customerId }), status: 'paid', limit: paidBefore ? 20 : 1 });
    const paidAt = (i: any) => (i.status_transitions?.paid_at ?? i.created ?? 0) * 1000;
    return (paidBefore ? (data as any[]).find((i) => paidAt(i) <= paidBefore.getTime()) : data[0]) ?? null;
  }

  /**
   * What refunding a patient's latest payment would return, and the prescription fee it would keep: for the admin to see before
   * deciding. Null when there is no paid payment. Never throws.
   */
  async previewRefund(patient: BillingPatient, opts: { prescriptionIssuedAt?: Date | null } = {}): Promise<{ amountCents: number; feeKeptCents: number; currency: string } | null> {
    if (!this.configured) return null;
    try {
      const subscriptionId = patient.stripeSubscriptionId ?? (await this.findSubscriptionByEmail(patient.email));
      const customerId = subscriptionId ? undefined : (patient.stripeCustomerId ?? (await this.findCustomerIdByEmail(patient.email)));
      if (!subscriptionId && !customerId) return null;
      const invoice = await this.latestPaidInvoice({ subscriptionId: subscriptionId ?? undefined, customerId });
      if (!invoice?.amount_paid) return null;
      const { amount, feeKept } = this.refundableOf(invoice, opts.prescriptionIssuedAt);
      return { amountCents: amount, feeKeptCents: feeKept, currency: invoice.currency };
    } catch (err: any) {
      this.logger.error(`Previewing a refund for ${patient.email} failed: ${err.message}`);
      return null;
    }
  }

  /**
   * `paid`: a payment had been taken. `refundId`: the refund made now; null when it was already refunded or nothing was paid.
   * `feeKept`: the prescription fee left out of the refund; `onlyFee`: nothing was returned because only the fee had been paid.
   */
  private async refundLatestPaidInvoice(
    scope: { subscriptionId?: string; customerId?: string },
    paidBefore?: Date,
    opts: { prescriptionIssuedAt?: Date | null } = {},
  ): Promise<{ paid: boolean; refundId: string | null; amount?: number; currency?: string; replayed?: boolean; feeKept?: number; onlyFee?: boolean }> {
    const invoice = await this.latestPaidInvoice(scope, paidBefore);
    if (!invoice || !invoice.amount_paid) return { paid: false, refundId: null };

    // Money was taken but there is no payment to refund against: never report that as done.
    const target = this.paymentOf(invoice);
    if (!target) throw new Error(`Invoice ${invoice.id} was paid but has no payment to refund — refund it in Stripe`);

    const { amount, feeKept } = this.refundableOf(invoice, opts.prescriptionIssuedAt);
    if (amount <= 0) return { paid: true, refundId: null, feeKept, onlyFee: true };

    try {
      // A refund that keeps the fee is a partial one (the amount is named); otherwise the whole payment goes back, as ever.
      const refund = await this.stripe.refunds.create(feeKept > 0 ? { ...target, amount } : target, { idempotencyKey: feeKept > 0 ? `decline-refund-${invoice.id}-keep-${feeKept}` : `decline-refund-${invoice.id}` });
      // Stripe answers a repeat of the same request with the refund it already made, and says so in this header: that refund was told about the first time.
      const replayed = (refund as any).lastResponse?.headers?.['idempotent-replayed'] === 'true';
      return { paid: true, refundId: refund.id, amount: refund.amount, currency: refund.currency, replayed, feeKept };
    } catch (err: any) {
      // Retried declines (or a manual refund in the dashboard) hit this — already done.
      if (err?.code === 'charge_already_refunded') return { paid: true, refundId: null, feeKept };
      throw err;
    }
  }

  /** Gives back what a patient paid for an extra consultation, in full. Throws if it can't; a repeat is a no-op. */
  async refundConsultInvoice(invoiceId: string): Promise<{ refundId: string | null }> {
    if (!this.configured) throw new Error('Stripe is not configured');
    const invoice = (await this.stripe.invoices.retrieve(invoiceId)) as any;
    const target = this.paymentOf(invoice);
    if (!target) throw new Error(`Invoice ${invoiceId} has no payment to refund — refund it in Stripe`);
    try {
      const refund = await this.stripe.refunds.create({ ...target, metadata: { reason: 'consultation' } }, { idempotencyKey: `consult-refund-${invoiceId}` });
      return { refundId: refund.id };
    } catch (err: any) {
      if (err?.code === 'charge_already_refunded') return { refundId: null };
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

  /**
   * Asks a patient who pays per supply to pay for one: a Stripe invoice at the full one-time price of each medicine that
   * the patient pays on Stripe's own page (no card is charged by us). Their account credit comes off first. Marked with
   * the order, so the payment event can release exactly that order. Throws if it can't be made: the caller retries.
   */
  async createSupplyInvoice(
    patient: BillingPatient,
    order: { id: string; patientId: string; description: string },
    priceIds: string[],
    /** The prescription fee for this supply, in cents, as its own line; 0 for none (a patient from before the fee). */
    feeCents = 0,
  ): Promise<{ invoiceId: string; url: string | null; amountCents: number; currency: string; paid: boolean }> {
    if (!this.configured) throw new Error('Stripe is not configured');
    const customerId = patient.stripeCustomerId ?? (await this.findCustomerIdByEmail(patient.email));
    if (!customerId) throw new Error('No Stripe customer found for this patient');
    const lines = toLines(priceIds);
    const prices = await Promise.all(lines.map((l) => this.stripe.prices.retrieve(l.price)));
    if (prices.some((p) => p.unit_amount == null || p.currency !== prices[0].currency)) throw new Error('The prices of this supply can’t be added up');

    const invoice = await this.stripe.invoices.create(
      {
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: 14,
        auto_advance: false,
        description: order.description,
        metadata: { kind: 'SUPPLY', orderId: order.id, patientId: order.patientId },
      },
      { idempotencyKey: `supply-invoice-${order.id}` },
    );
    for (const [i, price] of prices.entries()) {
      await this.stripe.invoiceItems.create(
        { customer: customerId, invoice: invoice.id, currency: price.currency, amount: price.unit_amount! * lines[i].quantity, description: order.description },
        { idempotencyKey: `supply-item-${order.id}-${price.id}` },
      );
    }
    if (feeApplies(feeCents, prices[0].currency)) {
      await this.stripe.invoiceItems.create(
        { customer: customerId, invoice: invoice.id, currency: prices[0].currency, amount: feeCents, description: PRESCRIPTION_FEE_LABEL },
        { idempotencyKey: `supply-fee-${order.id}` },
      );
    }
    const finalized = await this.stripe.invoices.finalizeInvoice(invoice.id);
    return {
      invoiceId: finalized.id,
      url: finalized.hosted_invoice_url ?? null,
      amountCents: finalized.amount_due,
      currency: finalized.currency,
      paid: finalized.status === 'paid',
    };
  }

  /** An invoice for an extra consultation the patient chose to book, paid on Stripe's own page. Throws if it can't be made. */
  async createConsultInvoice(
    patient: BillingPatient,
    request: { id: string; patientId: string },
    amountCents: number,
    currency: string,
  ): Promise<{ invoiceId: string; url: string | null; amountCents: number; currency: string; paid: boolean }> {
    if (!this.configured) throw new Error('Stripe is not configured');
    const customerId = patient.stripeCustomerId ?? (await this.findCustomerIdByEmail(patient.email));
    if (!customerId) throw new Error('No Stripe customer found for this patient');
    const invoice = await this.stripe.invoices.create(
      { customer: customerId, collection_method: 'send_invoice', days_until_due: 7, auto_advance: false, description: CONSULT_FEE_LABEL, metadata: { kind: 'CONSULT', appointmentId: request.id, patientId: request.patientId } },
      { idempotencyKey: `consult-invoice-${request.id}` },
    );
    await this.stripe.invoiceItems.create(
      { customer: customerId, invoice: invoice.id, currency, amount: amountCents, description: CONSULT_FEE_LABEL },
      { idempotencyKey: `consult-item-${request.id}` },
    );
    const finalized = await this.stripe.invoices.finalizeInvoice(invoice.id);
    return { invoiceId: finalized.id, url: finalized.hosted_invoice_url ?? null, amountCents: finalized.amount_due, currency: finalized.currency, paid: finalized.status === 'paid' };
  }

  /**
   * A returning patient who chooses to subscribe: the same medicine at the subscription price, with no prescription fee
   * (their prescription is already paid). Made incomplete, so the first month is paid inside our page; when that invoice is
   * paid the payment event releases their waiting order and reopens the account. Any earlier unpaid attempt for this order is
   * withdrawn first. Throws if it can't be made.
   */
  async createReturnSubscription(
    patient: BillingPatient,
    order: { id: string; patientId: string },
    priceIds: string[],
  ): Promise<{ subscriptionId: string; clientSecret: string; amountDueCents: number; totalCents: number; currency: string }> {
    if (!this.configured) throw new Error('Stripe is not configured');
    const customerId = patient.stripeCustomerId ?? (await this.findCustomerIdByEmail(patient.email));
    if (!customerId) throw new Error('No Stripe customer found for this patient');
    const prices = await Promise.all(toLines(priceIds).map((l) => this.stripe.prices.retrieve(l.price)));
    if (prices.some((p) => p.unit_amount == null || !p.recurring || p.recurring.interval !== 'month' || p.currency !== prices[0].currency)) {
      throw new Error('This treatment can’t be bought on a subscription yet');
    }
    const earlier = await this.stripe.subscriptions.list({ customer: customerId, status: 'incomplete', limit: 20 });
    await Promise.all(earlier.data.filter((s) => s.metadata?.returnOrderId === order.id).map((s) => this.stripe.subscriptions.cancel(s.id).catch(() => undefined)));

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: prices.map((p) => ({ quantity: 1, price_data: { currency: p.currency, product: typeof p.product === 'string' ? p.product : p.product.id, unit_amount: subscriptionAmount(p.unit_amount!), recurring: { interval: 'month' as const } } })),
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { kind: 'RETURN_SUBSCRIPTION', returnOrderId: order.id, patientId: order.patientId, billing: 'SUBSCRIPTION' },
    });
    const invoice = subscription.latest_invoice as any;
    const secret = invoice?.payment_intent?.client_secret as string | undefined;
    if (!secret) throw new Error(`Subscription ${subscription.id} has no payment to take`);
    return { subscriptionId: subscription.id, clientSecret: secret, amountDueCents: invoice.amount_due, totalCents: invoice.total ?? invoice.amount_due, currency: invoice.currency };
  }

  /**
   * What is needed to pay an open invoice inside our own page (Stripe's Payment Element) instead of Stripe's hosted invoice
   * page: the payment's secret, and the invoice's total before any account credit. Null when it can't be had (the invoice is
   * not open, or Stripe didn't make a payment for it). Never throws.
   */
  async invoicePaymentDetails(invoiceId: string): Promise<{ clientSecret: string; totalCents: number } | null> {
    if (!this.configured) return null;
    try {
      const invoice = (await this.stripe.invoices.retrieve(invoiceId, { expand: ['payment_intent'] })) as any;
      if (invoice.status !== 'open' || !invoice.payment_intent?.client_secret) return null;
      return { clientSecret: invoice.payment_intent.client_secret, totalCents: invoice.total ?? invoice.amount_due };
    } catch (err: any) {
      this.logger.error(`Reading the payment for invoice ${invoiceId} failed: ${err.message}`);
      return null;
    }
  }

  /** Withdraws a supply invoice nobody paid, so it can't be paid later for an order that was cancelled. Never throws. */
  async voidSupplyInvoice(invoiceId: string): Promise<void> {
    if (!this.configured) return;
    try {
      const invoice = await this.stripe.invoices.retrieve(invoiceId);
      if (invoice.status === 'open') await this.stripe.invoices.voidInvoice(invoiceId);
      else if (invoice.status === 'draft') await this.stripe.invoices.del(invoiceId);
    } catch (err: any) {
      this.logger.error(`Voiding invoice ${invoiceId} failed: ${err.message}`);
    }
  }

  /** Where the patient's subscription stands, or null when they have none (or it can't be read). Never throws. */
  async subscriptionState(patient: BillingPatient): Promise<{ status: string; endsAtPeriodEnd: boolean; endsAt: Date | null } | null> {
    if (!this.configured) return null;
    try {
      const id = patient.stripeSubscriptionId ?? (await this.findSubscriptionByEmail(patient.email));
      if (!id) return null;
      const sub = await this.stripe.subscriptions.retrieve(id);
      const ending = sub.cancel_at_period_end || sub.status === 'canceled';
      // A subscription that has already ended ended when it was cancelled, not at the end of the last period it covered.
      const at = sub.status === 'canceled' ? (sub.ended_at ?? sub.canceled_at ?? null) : (sub.cancel_at ?? (sub as any).current_period_end ?? null);
      return { status: sub.status, endsAtPeriodEnd: ending, endsAt: ending && at ? new Date(at * 1000) : null };
    } catch (err: any) {
      this.logger.error(`Reading the subscription of ${patient.email} failed: ${err.message}`);
      return null;
    }
  }

  /** Whether the patient has (or had) a subscription. When that can't be checked, say yes so the usual path reports the problem. */
  private async hasSubscription(patient: BillingPatient): Promise<boolean> {
    try {
      return !!(patient.stripeSubscriptionId ?? (await this.findSubscriptionByEmail(patient.email)));
    } catch {
      return true;
    }
  }

  private async hasCustomer(patient: BillingPatient): Promise<boolean> {
    try {
      return !!(patient.stripeCustomerId ?? (await this.findCustomerIdByEmail(patient.email)));
    } catch {
      return false;
    }
  }

  /** The refund for a patient who paid once: their latest paid invoice, with no subscription involved. Never throws. */
  private async refundPaidOnce(patient: BillingPatient, opts: { paidBefore?: Date; prescriptionIssuedAt?: Date | null }): Promise<BillingResult> {
    try {
      const customerId = patient.stripeCustomerId ?? (await this.findCustomerIdByEmail(patient.email));
      if (!customerId) return { ok: false, note: 'No Stripe customer found for this patient' };
      const { refundId, amount, currency, replayed, feeKept, onlyFee } = await this.refundLatestPaidInvoice({ customerId }, opts.paidBefore, opts);
      this.notifyRefund(patient, { refundId, amount, currency, replayed });
      if (onlyFee) return { ok: false, note: 'Nothing to refund: only the prescription fee was paid, and it isn’t returned' };
      return refundId
        ? { ok: true, note: feeKept ? `Refunded the latest payment except the ${(feeKept / 100).toFixed(2)} prescription fee (${refundId})` : `Refunded the latest payment (${refundId})` }
        : { ok: false, note: 'Nothing to refund: there is no paid payment, or it was already refunded' };
    } catch (err: any) {
      this.logger.error(`Refund for ${patient.email} failed: ${err.message}`);
      return { ok: false, note: `Refund failed (${err.message}) — refund it in Stripe by hand` };
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
