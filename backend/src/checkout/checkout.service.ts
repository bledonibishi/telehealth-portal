import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralsService } from '../referrals/referrals.service';
import { ConsultationKind, RiskTag } from '../common/enums';
import { triageEligibility } from '../questionnaires/triage';
import { findGlp1Dose, orderedTreatmentText } from '../catalog/ordered-dose';
import { PlanKey, planPriceEnvVars } from '../stripe/plan-pricing';

const PLANS: PlanKey[] = ['GLP1_STARTER', 'GLP1_ADVANCED', 'HRT_STARTER', 'HRT_COMPLETE', 'TRT_STANDARD'];

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
    addProgesterone?: boolean;
    applyReward?: boolean;
    shipping?: ShippingInput;
  }) {
    this.assertConfigured();
    // With a lead, the email comes from the lead itself, never from the request.
    const lead = input.leadId ? await this.loadOpenLead(input.leadId) : null;
    const priceId = await this.priceFor(input, lead);
    const email = lead?.email ?? input.email;
    const referralCoupon = await this.referralCouponFor(lead?.id, input.applyReward);
    if (lead) await this.saveLeadDetails(lead, input.shipping, input);

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.webflowSiteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.webflowSiteUrl}/checkout/cancel`,
      ...(email ? { customer_email: email } : {}),
      metadata: {
        planName: input.planName ?? '',
        leadId: lead?.id ?? '',
        email: email ?? '',
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

  /**
   * The price is decided here, never taken on trust from the page. Each GLP-1 dose has its own
   * price: the dose chosen in this request, or else the one already ordered on the lead, is charged
   * at that price. Otherwise the page's price must be one of the configured plan prices (a GLP-1
   * order: a GLP-1 plan), so a request can't buy a treatment at some cheaper price.
   */
  private async priceFor(
    input: { priceId?: string; product?: string; dose?: string },
    lead: { quizAnswers: unknown } | null,
  ): Promise<string> {
    const ordered = input.product && input.dose ? `${input.product} ${input.dose}` : orderedTreatmentText(lead?.quizAnswers);
    const chosen = await findGlp1Dose(this.prisma, ordered);
    if (chosen?.stripePriceId) return chosen.stripePriceId;

    if (!input.priceId) throw new BadRequestException('Missing priceId.');
    const plans = chosen ? PLANS.filter((p) => p.startsWith('GLP1_')) : PLANS;
    const allowed = plans.flatMap((p) => planPriceEnvVars(p).map((v) => this.config.get<string>(v))).filter(Boolean);
    if (!allowed.includes(input.priceId)) throw new BadRequestException('That plan isn’t available.');
    return input.priceId;
  }

  async createSubscriptionIntent(input: {
    priceId?: string;
    planName?: string;
    leadId?: string;
    medication?: string;
    product?: string;
    dose?: string;
    addProgesterone?: boolean;
    applyReward?: boolean;
    shipping?: ShippingInput;
  }) {
    this.assertConfigured();
    // The lead is the identity of this checkout: its email is the only one we
    // act on, so a request can't name someone else's email to touch their Stripe data.
    const lead = await this.loadOpenLead(input.leadId);
    const priceId = await this.priceFor(input, lead);
    const customerId = await this.findOrCreateCustomer(lead.email, this.sanitizeShipping(input.shipping));
    // Toggling the reward on the checkout page starts a new payment, so drop this
    // lead's abandoned unpaid ones instead of letting them pile up.
    await this.cancelIncompleteSubscriptions(customerId, lead.id);
    const referralCoupon = await this.referralCouponFor(lead.id, input.applyReward);
    await this.saveLeadDetails(lead, input.shipping, input);

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      ...(referralCoupon ? { discounts: [{ coupon: referralCoupon }] } : {}),
      metadata: {
        planName: input.planName ?? '',
        leadId: lead.id,
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

  /** The lead behind a checkout: must exist and not already be a paying customer. */
  private async loadOpenLead(leadId: string | undefined) {
    if (!leadId) throw new BadRequestException('Missing leadId.');
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, email: true, convertedAt: true, productKind: true, quizAnswers: true, checkoutDetails: true },
    });
    if (!lead) throw new BadRequestException('Unknown lead.');
    if (lead.convertedAt) throw new BadRequestException('This order has already been paid.');
    // The website stops these people at the quiz; this is the same check on the server, so skipping the page doesn't skip it.
    if (Array.isArray(lead.quizAnswers) && triageEligibility(lead.productKind as ConsultationKind, lead.quizAnswers as any[]).riskTag === RiskTag.RED) {
      throw new BadRequestException('Based on your answers, we can’t offer this treatment online.');
    }
    const patient = await this.prisma.patient.findFirst({
      where: { email: { equals: lead.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (patient) throw new BadRequestException('An account already exists for this email. Please sign in.');
    return lead;
  }

  /** Only the delivery fields we use, trimmed — nothing else from the request body is stored. */
  private sanitizeShipping(raw?: ShippingInput): ShippingInput | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const clip = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
    const country = clip(raw.country, 2)?.toUpperCase();
    return {
      name: clip(raw.name, 100),
      line1: clip(raw.line1, 200),
      city: clip(raw.city, 100),
      postalCode: clip(raw.postalCode, 20),
      country: country && country.length === 2 ? country : undefined,
    };
  }

  /**
   * Saves the delivery details on the lead (copied onto the patient when the
   * first payment succeeds) and the treatment the buyer picked, so the
   * reviewing clinician sees it alongside the eligibility answers.
   */
  private async saveLeadDetails(
    lead: { id: string; quizAnswers: unknown; checkoutDetails: unknown },
    shipping: ShippingInput | undefined,
    choice: { product?: string; dose?: string; addProgesterone?: boolean },
  ) {
    const clean = this.sanitizeShipping(shipping);
    const data: { checkoutDetails?: any; quizAnswers?: any } = {};
    if (clean) {
      const defined = Object.fromEntries(Object.entries(clean).filter(([, v]) => v !== undefined));
      data.checkoutDetails = { ...((lead.checkoutDetails as Record<string, unknown> | null) ?? {}), ...defined };
    }
    const product = typeof choice.product === 'string' ? choice.product.trim().slice(0, 80) : '';
    if (product) {
      const dose = typeof choice.dose === 'string' ? choice.dose.trim().slice(0, 40) : '';
      const answer = `${product}${dose ? ` ${dose}` : ''}${choice.addProgesterone ? ' + micronised progesterone' : ''}`;
      const existing = Array.isArray(lead.quizAnswers) ? (lead.quizAnswers as Array<{ questionId?: string }>) : [];
      // The final choice replaces the earlier "preferred medicine" from the products page.
      const kept = existing.filter((a) => a.questionId !== 'preferred_medication' && a.questionId !== 'preferred_treatment');
      data.quizAnswers = [...kept, { questionId: 'preferred_treatment', question: 'Preferred treatment (chosen at checkout)', answer }];
    }
    if (Object.keys(data).length) await this.prisma.lead.update({ where: { id: lead.id }, data });
  }

  /** Delivery details from the checkout form; called just before an inline card payment is confirmed. */
  async saveShipping(input: { leadId?: string; shipping?: ShippingInput }) {
    this.assertConfigured();
    const shipping = this.sanitizeShipping(input.shipping);
    if (!shipping) throw new BadRequestException('Missing shipping details.');
    const lead = await this.loadOpenLead(input.leadId);
    await this.saveLeadDetails(lead, shipping, {});
    await this.findOrCreateCustomer(lead.email, shipping);
    return { ok: true };
  }

  /** Cancels only this lead's own abandoned unpaid subscriptions, never anyone else's. */
  private async cancelIncompleteSubscriptions(customerId: string, leadId: string) {
    const { data } = await this.stripe.subscriptions.list({ customer: customerId, status: 'incomplete', limit: 20 });
    await Promise.all(
      data.filter((sub) => sub.metadata?.leadId === leadId).map((sub) => this.stripe.subscriptions.cancel(sub.id).catch(() => undefined)),
    );
  }

  private async findOrCreateCustomer(email: string, shipping?: ShippingInput): Promise<string> {
    const address = shipping && { line1: shipping.line1, city: shipping.city, postal_code: shipping.postalCode, country: shipping.country };
    const details: Stripe.CustomerUpdateParams = shipping
      ? { ...(shipping.name ? { name: shipping.name } : {}), address, shipping: { name: shipping.name ?? '', address: address! } }
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
