import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralsService } from '../referrals/referrals.service';

// REST endpoints for the Webflow "Site Scripts" embed (website/webflow/live-site-scripts-embed.html),
// which posts here directly rather than through GraphQL. Two Stripe flows:
//   - createHostedSession: classic redirect to a Stripe-hosted Checkout page (the fallback the
//     embed uses when no Stripe publishable key is configured client-side).
//   - createSubscriptionIntent: powers the embed's inline Stripe Payment Element — a Subscription
//     is created in payment_behavior:'default_incomplete' mode, and its first invoice's
//     PaymentIntent client_secret is handed back for the embed to confirm on-page.
// Both still end up firing the same kinds of Stripe events; see stripe-webhook.service.ts for
// where invoice.payment_succeeded was added alongside the existing checkout.session.completed
// handling so patient activation fires either way.
export interface ShippingInput {
  name?: string;
  line1?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private stripe: Stripe;
  private stripeConfigured: boolean;
  private webflowSiteUrl: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private referrals: ReferralsService,
  ) {
    const secretKey = config.get<string>('STRIPE_SECRET_KEY');
    this.stripeConfigured = Boolean(secretKey);
    this.stripe = new Stripe(secretKey ?? '', { apiVersion: '2023-10-16' as any });
    this.webflowSiteUrl = config.get<string>('WEBFLOW_SITE_URL', 'http://localhost:3000');
  }

  async createHostedSession(input: {
    priceId?: string;
    planName?: string;
    leadId?: string;
    email?: string;
    product?: string;
    dose?: string;
    applyReward?: boolean;
    shipping?: ShippingInput;
  }) {
    this.assertConfigured();
    if (!input.priceId) throw new BadRequestException('Missing priceId.');

    const referralCoupon = await this.referralCouponFor(input.leadId, input.applyReward);
    await this.saveCheckoutDetails(input.leadId, { ...(input.shipping ?? {}), referralRewardApplied: Boolean(referralCoupon) });

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: `${this.webflowSiteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.webflowSiteUrl}/checkout/cancel`,
      ...(input.email ? { customer_email: input.email } : {}),
      metadata: {
        planName: input.planName ?? '',
        leadId: input.leadId ?? '',
        email: input.email ?? '',
        product: input.product ?? '',
        dose: input.dose ?? '',
      },
      // Stripe rejects setting both allow_promotion_codes and discounts on the
      // same session — a referred friend's discount is attached automatically,
      // so they don't also get a promo-code box to type one into.
      ...(referralCoupon ? { discounts: [{ coupon: referralCoupon }] } : { allow_promotion_codes: true }),
    });

    return { url: session.url };
  }

  async createSubscriptionIntent(input: {
    priceId?: string;
    planName?: string;
    email?: string;
    leadId?: string;
    medication?: string;
    product?: string;
    dose?: string;
    applyReward?: boolean;
    shipping?: ShippingInput;
  }) {
    this.assertConfigured();
    if (!input.priceId) throw new BadRequestException('Missing priceId.');
    if (!input.email) throw new BadRequestException('Missing email.');

    const customerId = await this.findOrCreateCustomer(input.email, input.shipping);
    // Toggling the reward on the checkout page starts a new payment, so drop
    // the abandoned unpaid ones instead of letting them pile up.
    await this.cancelIncompleteSubscriptions(customerId);
    const referralCoupon = await this.referralCouponFor(input.leadId, input.applyReward);
    await this.saveCheckoutDetails(input.leadId, { ...(input.shipping ?? {}), referralRewardApplied: Boolean(referralCoupon) });

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: input.priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      ...(referralCoupon ? { discounts: [{ coupon: referralCoupon }] } : {}),
      metadata: {
        planName: input.planName ?? '',
        leadId: input.leadId ?? '',
        medication: input.medication ?? '',
        product: input.product ?? '',
        dose: input.dose ?? '',
      },
    });

    // Cast to any: the installed Stripe SDK's types target a newer API version than
    // the '2023-10-16' one this app runs against (see apiVersion above), where
    // Invoice.payment_intent has moved/been renamed in the type definitions.
    const invoice = subscription.latest_invoice as any;
    const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent | undefined;
    if (!paymentIntent?.client_secret) {
      this.logger.error(`Subscription ${subscription.id} has no payment_intent client_secret`);
      throw new InternalServerErrorException('Could not start card payment.');
    }

    // So the inline checkout can show what the referral reward took off — the
    // Payment Element itself has no line items.
    const discountCents = ((invoice?.total_discount_amounts ?? []) as Array<{ amount: number }>).reduce((sum, d) => sum + d.amount, 0);
    return {
      clientSecret: paymentIntent.client_secret,
      intentType: 'payment',
      amountDueCents: invoice?.amount_due ?? null,
      discountCents,
      currency: invoice?.currency ?? null,
    };
  }

  /**
   * What the success page needs once the buyer is back from Stripe. The
   * Stripe session / payment intent id acts as the bearer secret, and only a
   * first name and a (meant-to-be-shared) referral link are returned. The
   * patient row is created by the webhook, which may lag the redirect, so
   * `ready: false` means "ask again shortly".
   */
  async successInfo(input: { sessionId?: string; paymentIntentId?: string }) {
    this.assertConfigured();

    let email: string | null | undefined;
    if (input.sessionId) {
      const session = await this.stripe.checkout.sessions.retrieve(input.sessionId);
      if (session.payment_status !== 'paid') throw new BadRequestException('Payment not completed.');
      email = session.customer_details?.email ?? session.customer_email;
    } else if (input.paymentIntentId) {
      const intent = await this.stripe.paymentIntents.retrieve(input.paymentIntentId, { expand: ['customer'] });
      if (intent.status !== 'succeeded') throw new BadRequestException('Payment not completed.');
      email = (intent.customer as Stripe.Customer | null)?.email ?? intent.receipt_email;
    } else {
      throw new BadRequestException('Missing session_id or payment_intent.');
    }
    if (!email) return { ready: false };

    const patient = await this.prisma.patient.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, firstName: true, email: true },
    });
    if (!patient) return { ready: false };

    return {
      ready: true,
      firstName: patient.firstName,
      email: patient.email,
      referralLink: await this.referrals.referralLinkFor(patient.id),
    };
  }

  // Returns the referral-friend coupon id when this lead arrived via a still-
  // unconverted referral AND the customer chose to apply the reward.
  private async referralCouponFor(leadId: string | undefined, applyReward = false): Promise<string | undefined> {
    if (!leadId || !applyReward) return undefined;
    const referral = await this.prisma.referral.findUnique({ where: { referredLeadId: leadId }, select: { status: true } });
    if (!referral || referral.status !== 'PENDING') return undefined;

    const couponId = this.config.get<string>('STRIPE_REFERRAL_FRIEND_COUPON_ID');
    if (!couponId) {
      this.logger.warn(`Lead ${leadId} has a pending referral but STRIPE_REFERRAL_FRIEND_COUPON_ID is not set`);
      return undefined;
    }
    return couponId;
  }

  /** What the checkout page can offer this lead: today, the referral reward for a referred friend. */
  async rewardsFor(leadId?: string) {
    this.assertConfigured();
    const couponId = await this.referralCouponFor(leadId, true);
    if (!couponId) return { referralReward: null };

    const coupon = await this.stripe.coupons.retrieve(couponId);
    return {
      referralReward: {
        title: 'Referral reward',
        description: 'A friend invited you — enjoy a discount on your first order.',
        amountOffCents: coupon.amount_off ?? null,
        percentOff: coupon.percent_off ?? null,
        currency: coupon.currency ?? null,
      },
    };
  }

  /** Merges into what the lead already has, so saving the address never forgets whether the reward was applied. */
  private async saveCheckoutDetails(leadId: string | undefined, patch: Record<string, unknown>) {
    if (!leadId) return;
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { checkoutDetails: true } });
    if (!lead) return;
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { checkoutDetails: { ...((lead.checkoutDetails as Record<string, unknown> | null) ?? {}), ...patch } as any },
    });
  }

  /** Delivery details from the checkout form; called just before an inline card payment is confirmed. */
  async saveShipping(input: { leadId?: string; email?: string; shipping?: ShippingInput }) {
    this.assertConfigured();
    if (!input.shipping) throw new BadRequestException('Missing shipping details.');
    await this.saveCheckoutDetails(input.leadId, { ...input.shipping });
    if (input.email) await this.findOrCreateCustomer(input.email, input.shipping);
    return { ok: true };
  }

  private async cancelIncompleteSubscriptions(customerId: string) {
    const { data } = await this.stripe.subscriptions.list({ customer: customerId, status: 'incomplete', limit: 20 });
    await Promise.all(data.map((sub) => this.stripe.subscriptions.cancel(sub.id).catch(() => undefined)));
  }

  private async findOrCreateCustomer(email: string, shipping?: ShippingInput): Promise<string> {
    const details: Stripe.CustomerUpdateParams = shipping
      ? {
          ...(shipping.name ? { name: shipping.name } : {}),
          address: { line1: shipping.line1, city: shipping.city, postal_code: shipping.postalCode, country: shipping.country },
          shipping: {
            name: shipping.name ?? '',
            address: { line1: shipping.line1, city: shipping.city, postal_code: shipping.postalCode, country: shipping.country },
          },
        }
      : {};
    const existing = await this.stripe.customers.list({ email, limit: 1 });
    if (existing.data[0]) {
      if (shipping) await this.stripe.customers.update(existing.data[0].id, details);
      return existing.data[0].id;
    }
    const created = await this.stripe.customers.create({ email, ...(details as Stripe.CustomerCreateParams) });
    return created.id;
  }

  private assertConfigured() {
    if (!this.stripeConfigured) throw new BadRequestException('Stripe is not configured.');
  }
}
