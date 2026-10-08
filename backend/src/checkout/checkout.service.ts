import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralsService } from '../referrals/referrals.service';
import { ConsultationKind, ProductCategory, RiskTag } from '../common/enums';
import { triageEligibility } from '../questionnaires/triage';
import { findDose, findProgesteronePriceId, orderedTreatmentText } from '../catalog/ordered-dose';
import { PlanKey, planPriceEnvVars } from '../stripe/plan-pricing';

// The plans each treatment can be bought on.
const PLANS_FOR: Record<ConsultationKind, PlanKey[]> = {
  [ConsultationKind.GLP1]: ['GLP1_STARTER', 'GLP1_ADVANCED'],
  [ConsultationKind.HRT]: ['HRT_STARTER', 'HRT_COMPLETE'],
  [ConsultationKind.TRT]: ['TRT_STANDARD'],
};

// The programme each kind of medicine belongs to: a dose is only charged at its own price when it is
// for the treatment the lead is buying, so a cheap HRT dose can't pay for a GLP-1 programme.
const KIND_OF_CATEGORY: Record<string, ConsultationKind> = {
  [ProductCategory.GLP1]: ConsultationKind.GLP1,
  [ProductCategory.ESTROGEN]: ConsultationKind.HRT,
  [ProductCategory.TESTOSTERONE]: ConsultationKind.TRT,
};

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
    const lines = await this.priceFor(input, lead);
    const email = lead?.email ?? input.email;
    const currency = lead && input.applyReward ? (await this.stripe.prices.retrieve(lines[0].price)).currency : undefined;
    const referralCoupon = await this.referralCouponFor(lead?.id, input.applyReward, currency);
    if (currency) await this.assertCouponFits(referralCoupon, currency);
    if (lead) await this.saveLeadDetails(lead, input.shipping, input);

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lines,
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
   * at that price. Otherwise the page's price must be a configured plan price for the treatment
   * being bought — the lead's, never the request's — so a request can't buy a treatment at some
   * cheaper price (e.g. a GLP-1 dose the catalog doesn't know, at the HRT plan's price).
   */
  private async priceFor(
    input: { priceId?: string; product?: string; dose?: string; addProgesterone?: boolean },
    lead: { quizAnswers: unknown; productKind?: string | null } | null,
  ): Promise<Array<{ price: string; quantity: number }>> {
    const ordered = input.product && input.dose ? `${input.product} ${input.dose}` : orderedTreatmentText(lead?.quizAnswers);
    const found = await findDose(this.prisma, ordered, Object.keys(KIND_OF_CATEGORY) as ProductCategory[]);
    const leadKind = lead?.productKind as ConsultationKind | undefined;
    const chosen = found && (!leadKind || KIND_OF_CATEGORY[found.category] === leadKind) ? found : null;
    if (chosen?.stripePriceId) {
      // HRT: the progesterone add-on is its own line at its own price.
      const wantsProgesterone = chosen.category === ProductCategory.ESTROGEN && (input.addProgesterone ?? /progesterone/i.test(ordered ?? ''));
      const progesterone = wantsProgesterone ? await findProgesteronePriceId(this.prisma) : null;
      // Without a price for it, fall through to the plan that covers both medicines.
      if (!wantsProgesterone || progesterone) {
        return [chosen.stripePriceId, ...(progesterone ? [progesterone] : [])].map((price) => ({ price, quantity: 1 }));
      }
    }

    if (!input.priceId) throw new BadRequestException('Missing priceId.');
    const kind = chosen ? KIND_OF_CATEGORY[chosen.category] : leadKind;
    const plans = kind && PLANS_FOR[kind] ? PLANS_FOR[kind] : Object.values(PLANS_FOR).flat();
    const allowed = plans.flatMap((p) => planPriceEnvVars(p).map((v) => this.config.get<string>(v))).filter(Boolean);
    if (!allowed.includes(input.priceId)) throw new BadRequestException('That plan isn’t available.');
    return [{ price: input.priceId, quantity: 1 }];
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
    const lines = await this.priceFor(input, lead);
    const { currency } = await this.stripe.prices.retrieve(lines[0].price);
    // The delivery details saved earlier (the details step) cover a customer created just now.
    const shipping = this.sanitizeShipping(input.shipping) ?? this.sanitizeShipping(lead.checkoutDetails as ShippingInput | undefined);
    const customerId = await this.findOrCreateCustomer(lead.email, shipping, currency);
    // Toggling the reward on the checkout page starts a new payment, so drop this
    // lead's abandoned unpaid ones instead of letting them pile up.
    await this.cancelIncompleteSubscriptions(customerId, lead.id);
    const referralCoupon = await this.referralCouponFor(lead.id, input.applyReward, currency);
    await this.assertCouponFits(referralCoupon, currency);
    await this.saveLeadDetails(lead, input.shipping, input);

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: lines,
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
  // unconverted referral AND the customer chose to apply the reward. A fixed-amount coupon is
  // tied to one currency, so STRIPE_REFERRAL_FRIEND_COUPON_ID_<CURRENCY> (e.g. _EUR) is used for
  // an order in that currency; STRIPE_REFERRAL_FRIEND_COUPON_ID is the fallback.
  private async referralCouponFor(leadId: string | undefined, applyReward = false, currency?: string): Promise<string | undefined> {
    if (!leadId || !applyReward) return undefined;
    const referral = await this.prisma.referral.findUnique({ where: { referredLeadId: leadId }, select: { status: true } });
    if (!referral || referral.status !== 'PENDING') return undefined;

    const couponId = this.referralCouponId(currency);
    if (!couponId) {
      this.logger.warn(`Lead ${leadId} has a pending referral but no referral coupon is set (STRIPE_REFERRAL_FRIEND_COUPON_ID${currency ? `_${currency.toUpperCase()}` : ''})`);
      return undefined;
    }
    return couponId;
  }

  private referralCouponId(currency?: string): string | undefined {
    const base = 'STRIPE_REFERRAL_FRIEND_COUPON_ID';
    // Without an order currency (only to describe the offer), the euro one — the shop's currency — comes first.
    const specific = currency ? this.config.get<string>(`${base}_${currency.toUpperCase()}`) : this.config.get<string>(`${base}_EUR`);
    return specific?.trim() || this.config.get<string>(base)?.trim() || undefined;
  }

  /**
   * A fixed-amount coupon only works in its own currency (or one it lists); Stripe otherwise refuses the
   * whole subscription. Say so clearly, rather than letting the card form fail without a reason.
   */
  private async assertCouponFits(couponId: string | undefined, currency: string) {
    if (!couponId) return;
    const coupon = (await this.stripe.coupons.retrieve(couponId)) as Stripe.Coupon & { currency_options?: Record<string, unknown> };
    if (coupon.amount_off == null) return;
    const code = currency.toLowerCase();
    if (coupon.currency?.toLowerCase() === code || coupon.currency_options?.[code]) return;
    this.logger.error(`Referral coupon ${couponId} is in ${coupon.currency} and has no ${code} amount, so it can't be applied to a ${code} order`);
    throw new BadRequestException('The referral reward can’t be applied to this order. Remove it to continue.');
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
      select: { id: true, email: true, convertedAt: true, productKind: true, quizAnswers: true, checkoutDetails: true, intakeSavedAt: true },
    });
    if (!lead) throw new BadRequestException('Unknown lead.');
    if (lead.convertedAt) throw new BadRequestException('This order has already been paid.');
    // The website stops these people at the quiz; this is the same check on the server, so skipping the page doesn't skip it.
    if (Array.isArray(lead.quizAnswers) && triageEligibility(lead.productKind as ConsultationKind, lead.quizAnswers as any[]).riskTag === RiskTag.RED) {
      throw new BadRequestException('Based on your answers, we can’t offer this treatment online.');
    }
    // The medical questionnaire comes before payment; the website sends people to it, and this is the same check here.
    if (!lead.intakeSavedAt) throw new BadRequestException('Please answer the health questions before paying.');
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

  /**
   * The Stripe customer for this email. A customer is locked to the currency of its first subscription,
   * so one left over from an earlier checkout in another currency (e.g. a USD test price) can't be reused
   * for a price in `currency`; a fresh customer is made instead.
   */
  private async findOrCreateCustomer(email: string, shipping?: ShippingInput, currency?: string): Promise<string> {
    const address = shipping && { line1: shipping.line1, city: shipping.city, postal_code: shipping.postalCode, country: shipping.country };
    const details: Stripe.CustomerUpdateParams = shipping
      ? { ...(shipping.name ? { name: shipping.name } : {}), address, shipping: { name: shipping.name ?? '', address: address! } }
      : {};
    const existing = await this.stripe.customers.list({ email, limit: 10 });
    const usable = existing.data.find((c) => !currency || !c.currency || c.currency === currency);
    if (usable) {
      if (shipping) await this.stripe.customers.update(usable.id, details);
      return usable.id;
    }
    const created = await this.stripe.customers.create({ email, ...(details as Stripe.CustomerCreateParams) });
    return created.id;
  }

  private assertConfigured() {
    if (!this.stripeConfigured) throw new BadRequestException('Stripe is not configured.');
  }
}
