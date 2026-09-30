import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

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
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private stripe: Stripe;
  private stripeConfigured: boolean;
  private webflowSiteUrl: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const secretKey = config.get<string>('STRIPE_SECRET_KEY');
    this.stripeConfigured = Boolean(secretKey);
    this.stripe = new Stripe(secretKey ?? '', { apiVersion: '2023-10-16' as any });
    this.webflowSiteUrl = config.get<string>('WEBFLOW_SITE_URL', 'http://localhost:3000');
  }

  async createHostedSession(input: { priceId?: string; planName?: string; leadId?: string }) {
    this.assertConfigured();
    if (!input.priceId) throw new BadRequestException('Missing priceId.');

    const referralCoupon = await this.referralCouponFor(input.leadId);

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: `${this.webflowSiteUrl}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.webflowSiteUrl}/checkout-cancel`,
      metadata: { planName: input.planName ?? '', leadId: input.leadId ?? '' },
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
  }) {
    this.assertConfigured();
    if (!input.priceId) throw new BadRequestException('Missing priceId.');
    if (!input.email) throw new BadRequestException('Missing email.');

    const customerId = await this.findOrCreateCustomer(input.email);
    const referralCoupon = await this.referralCouponFor(input.leadId);

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

    return { clientSecret: paymentIntent.client_secret, intentType: 'payment' };
  }

  // Returns the referral-friend coupon id when this lead arrived via a still-
  // unconverted referral, so their first checkout shows the $20 off automatically.
  private async referralCouponFor(leadId: string | undefined): Promise<string | undefined> {
    if (!leadId) return undefined;
    const referral = await this.prisma.referral.findUnique({ where: { referredLeadId: leadId }, select: { status: true } });
    if (!referral || referral.status !== 'PENDING') return undefined;

    const couponId = this.config.get<string>('STRIPE_REFERRAL_FRIEND_COUPON_ID');
    if (!couponId) {
      this.logger.warn(`Lead ${leadId} has a pending referral but STRIPE_REFERRAL_FRIEND_COUPON_ID is not set`);
      return undefined;
    }
    return couponId;
  }

  private async findOrCreateCustomer(email: string): Promise<string> {
    const existing = await this.stripe.customers.list({ email, limit: 1 });
    if (existing.data[0]) return existing.data[0].id;
    const created = await this.stripe.customers.create({ email });
    return created.id;
  }

  private assertConfigured() {
    if (!this.stripeConfigured) throw new BadRequestException('Stripe is not configured.');
  }
}
