import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

// The real Stripe SDK throws at construction with no key; every test replaces
// `stripe` with a spy before any call.
// The configured plan prices: the only prices a page may ask for.
const SETTINGS: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_REFERRAL_FRIEND_COUPON_ID: 'coupon_ref',
  STRIPE_PRICE_OESTROGEN: 'price_1',
  STRIPE_PRICE_GLP1_ADVANCED: 'price_tier',
};
const config = { get: jest.fn((key: string, def?: any) => SETTINGS[key] ?? def) };

function build(prisma: any, stripe: any, referrals: any = { referralLinkFor: jest.fn() }) {
  const service = new CheckoutService(config as any, prisma, referrals);
  (service as any).stripe = stripe;
  return service;
}

const LEAD = { id: 'lead-1', email: 'buyer@b.com', convertedAt: null, productKind: 'HRT', quizAnswers: [{ questionId: 'age', question: 'Age?', answer: '40 to 54' }], checkoutDetails: null, intakeSavedAt: new Date() };

function prismaFor(over: { lead?: any; patient?: any; referral?: any; products?: any[] } = {}) {
  return {
    lead: {
      findUnique: jest.fn().mockResolvedValue('lead' in over ? over.lead : LEAD),
      update: jest.fn().mockResolvedValue({}),
    },
    patient: { findFirst: jest.fn().mockResolvedValue(over.patient ?? null) },
    referral: { findUnique: jest.fn().mockResolvedValue(over.referral ?? null) },
    product: { findMany: jest.fn().mockResolvedValue(over.products ?? []) },
  };
}

describe('CheckoutService per-dose prices', () => {
  const GLP1_LEAD = { ...LEAD, productKind: 'GLP1' };
  const MOUNJARO = {
    id: 'p1', slug: 'tirzepatide-mounjaro', name: 'Tirzepatide', brandName: 'Mounjaro', category: 'GLP1',
    strengths: [
      { id: 's1', label: '2.5 mg', titrationStep: 1, stripePriceId: 'price_m25' },
      { id: 's3', label: '7.5 mg', titrationStep: 3, stripePriceId: 'price_m75' },
      { id: 's5', label: '12.5 mg', titrationStep: 5, stripePriceId: null },
    ],
  };

  it('charges the chosen dose’s own price, whatever price the page sent', async () => {
    const session = { create: jest.fn().mockResolvedValue({ url: 'u' }) };
    await build(prismaFor({ lead: GLP1_LEAD, products: [MOUNJARO] }), { checkout: { sessions: session } }).createHostedSession({
      priceId: 'price_cheapest', leadId: 'lead-1', product: 'Mounjaro', dose: '7.5 mg',
    });
    expect(session.create.mock.calls[0][0].line_items).toEqual([{ price: 'price_m75', quantity: 1 }]);
  });

  it('uses the page’s plan price for a dose not priced individually', async () => {
    const session = { create: jest.fn().mockResolvedValue({ url: 'u' }) };
    await build(prismaFor({ lead: GLP1_LEAD, products: [MOUNJARO] }), { checkout: { sessions: session } }).createHostedSession({
      priceId: 'price_tier', leadId: 'lead-1', product: 'Mounjaro', dose: '12.5 mg',
    });
    expect(session.create.mock.calls[0][0].line_items).toEqual([{ price: 'price_tier', quantity: 1 }]);
  });

  it('refuses a price that isn’t one of the configured plans', async () => {
    const session = { create: jest.fn() };
    await expect(
      build(prismaFor(), { checkout: { sessions: session } }).createHostedSession({ priceId: 'price_whatever_is_cheapest', leadId: 'lead-1' }),
    ).rejects.toThrow(BadRequestException);
    expect(session.create).not.toHaveBeenCalled();
  });

  it('refuses another treatment’s plan price for a GLP-1 dose', async () => {
    const session = { create: jest.fn() };
    await expect(
      build(prismaFor({ lead: GLP1_LEAD, products: [MOUNJARO] }), { checkout: { sessions: session } }).createHostedSession({
        priceId: 'price_1', leadId: 'lead-1', product: 'Mounjaro', dose: '12.5 mg',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to take payment before the health questions are answered', async () => {
    const session = { create: jest.fn() };
    const lead = { ...LEAD, intakeSavedAt: null };
    await expect(
      build(prismaFor({ lead }), { checkout: { sessions: session } }).createHostedSession({ priceId: 'price_1', leadId: 'lead-1' }),
    ).rejects.toThrow(/health questions/);
    expect(session.create).not.toHaveBeenCalled();
  });

  it('refuses another treatment’s plan price for a GLP-1 lead whose dose the catalog doesn’t know', async () => {
    const session = { create: jest.fn() };
    const lead = { ...LEAD, productKind: 'GLP1' };
    await expect(
      build(prismaFor({ lead, products: [MOUNJARO] }), { checkout: { sessions: session } }).createHostedSession({
        priceId: 'price_1', leadId: 'lead-1', product: 'Mounjaro', dose: '99 mg',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(session.create).not.toHaveBeenCalled();
  });

  it('charges the dose already ordered on the lead when the request leaves product and dose out', async () => {
    const session = { create: jest.fn().mockResolvedValue({ url: 'u' }) };
    const lead = { ...LEAD, productKind: 'GLP1', quizAnswers: [{ questionId: 'preferred_treatment', answer: 'Mounjaro 7.5 mg' }] };
    await build(prismaFor({ lead, products: [MOUNJARO] }), { checkout: { sessions: session } }).createHostedSession({ priceId: 'price_1', leadId: 'lead-1' });
    expect(session.create.mock.calls[0][0].line_items).toEqual([{ price: 'price_m75', quantity: 1 }]);
  });
});

describe('CheckoutService HRT and TRT dose prices', () => {
  const HRT_PRODUCTS = [
    { id: 'e1', slug: 'estradiol-patch-evorel', name: 'Estradiol patch', brandName: 'Evorel', category: 'ESTROGEN', strengths: [{ id: 'e1s', label: '50 micrograms/24 h', titrationStep: null, stripePriceId: 'price_evorel' }] },
    { id: 'e2', slug: 'estradiol-gel-oestrogel', name: 'Estradiol gel 0.06%', brandName: 'Oestrogel', category: 'ESTROGEN', strengths: [{ id: 'e2s', label: '0.75 mg per pump', titrationStep: null, stripePriceId: null }] },
    { id: 't1', slug: 'testosterone-gel-tostran', name: 'Testosterone gel 2%', brandName: 'Tostran', category: 'TESTOSTERONE', strengths: [{ id: 't1s', label: '20 mg (2 pumps)', titrationStep: null, stripePriceId: 'price_tostran' }] },
  ];
  const withProgesterone = (prisma: any, price: string | null = 'price_utro') => {
    prisma.product.findFirst = jest.fn().mockResolvedValue(price ? { strengths: [{ stripePriceId: price }] } : null);
    return prisma;
  };
  const lines = async (prisma: any, input: any) => {
    const session = { create: jest.fn().mockResolvedValue({ url: 'u' }) };
    await build(prisma, { checkout: { sessions: session } }).createHostedSession({ priceId: 'price_1', leadId: 'lead-1', ...input });
    return session.create.mock.calls[0][0].line_items;
  };

  it('charges an HRT dose at its own price', async () => {
    expect(await lines(prismaFor({ products: HRT_PRODUCTS }), { product: 'Evorel', dose: '50 micrograms/24 h' })).toEqual([{ price: 'price_evorel', quantity: 1 }]);
  });

  it('adds the progesterone price as a second line when it is ticked', async () => {
    const prisma = withProgesterone(prismaFor({ products: HRT_PRODUCTS }));
    expect(await lines(prisma, { product: 'Evorel', dose: '50 micrograms/24 h', addProgesterone: true })).toEqual([
      { price: 'price_evorel', quantity: 1 },
      { price: 'price_utro', quantity: 1 },
    ]);
  });

  it('falls back to the plan price when the progesterone has no price of its own', async () => {
    const prisma = withProgesterone(prismaFor({ products: HRT_PRODUCTS }), null);
    expect(await lines(prisma, { product: 'Evorel', dose: '50 micrograms/24 h', addProgesterone: true })).toEqual([{ price: 'price_1', quantity: 1 }]);
  });

  it('falls back to the plan price for an HRT dose with no price of its own', async () => {
    expect(await lines(prismaFor({ products: HRT_PRODUCTS }), { product: 'Oestrogel', dose: '0.75 mg per pump' })).toEqual([{ price: 'price_1', quantity: 1 }]);
  });

  it('charges a TRT dose at its own price', async () => {
    const lead = { ...LEAD, productKind: 'TRT' };
    expect(await lines(prismaFor({ lead, products: HRT_PRODUCTS }), { product: 'Tostran', dose: '20 mg (2 pumps)' })).toEqual([{ price: 'price_tostran', quantity: 1 }]);
  });

  it('does not let one programme’s cheap dose pay for another’s', async () => {
    const lead = { ...LEAD, productKind: 'TRT' };
    const session = { create: jest.fn() };
    await expect(
      build(prismaFor({ lead, products: HRT_PRODUCTS }), { checkout: { sessions: session } }).createHostedSession({
        priceId: 'price_1', leadId: 'lead-1', product: 'Evorel', dose: '50 micrograms/24 h',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(session.create).not.toHaveBeenCalled();
  });
});

describe('CheckoutService.createHostedSession', () => {
  const session = { create: jest.fn().mockResolvedValue({ url: 'https://stripe/x' }) };
  const stripe = { checkout: { sessions: session } };

  beforeEach(() => jest.clearAllMocks());

  it('redirects back to the website pages and prefills the lead email (not one from the request)', async () => {
    await build(prismaFor(), stripe).createHostedSession({ priceId: 'price_1', leadId: 'lead-1', email: 'attacker@evil.com', product: 'Wegovy', dose: '0.25 mg' });

    const args = session.create.mock.calls[0][0];
    expect(args.success_url).toBe('http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}');
    expect(args.cancel_url).toBe('http://localhost:3000/checkout/cancel');
    expect(args.customer_email).toBe('buyer@b.com');
    expect(args.metadata).toMatchObject({ leadId: 'lead-1', email: 'buyer@b.com', product: 'Wegovy', dose: '0.25 mg' });
    expect(args.allow_promotion_codes).toBe(true);
    expect(args.discounts).toBeUndefined();
  });

  it('refuses a lead whose eligibility answers are disqualifying, even if the website let them through', async () => {
    const red = { ...LEAD, productKind: 'HRT', quizAnswers: [{ questionId: 'age', question: 'Age?', answer: 'Under 18' }] };
    await expect(build(prismaFor({ lead: red }), stripe).createHostedSession({ priceId: 'price_1', leadId: 'lead-1' })).rejects.toThrow('can’t offer this treatment online');
    expect(session.create).not.toHaveBeenCalled();
  });

  it('lets a lead with only warnings (ORANGE) go on to pay', async () => {
    const orange = { ...LEAD, quizAnswers: [{ questionId: 'age', question: 'Age?', answer: '18 to 39' }] };
    await build(prismaFor({ lead: orange }), stripe).createHostedSession({ priceId: 'price_1', leadId: 'lead-1' });
    expect(session.create).toHaveBeenCalled();
  });

  it('does not attach the referral coupon unless the customer applied the reward', async () => {
    await build(prismaFor({ referral: { status: 'PENDING' } }), stripe).createHostedSession({ priceId: 'price_1', leadId: 'lead-1' });
    expect(session.create.mock.calls[0][0].discounts).toBeUndefined();
  });

  it('attaches the referral coupon (and drops promo codes) when the reward is applied', async () => {
    const withCoupon = {
      ...stripe,
      prices: { retrieve: jest.fn().mockResolvedValue({ currency: 'eur' }) },
      coupons: { retrieve: jest.fn().mockResolvedValue({ amount_off: 2000, currency: 'eur' }) },
    };
    await build(prismaFor({ referral: { status: 'PENDING' } }), withCoupon).createHostedSession({ priceId: 'price_1', leadId: 'lead-1', applyReward: true });

    const args = session.create.mock.calls[0][0];
    expect(args.discounts).toEqual([{ coupon: 'coupon_ref' }]);
    expect(args.allow_promotion_codes).toBeUndefined();
  });

  it('refuses a lead that has already paid', async () => {
    await expect(build(prismaFor({ lead: { ...LEAD, convertedAt: new Date() } }), stripe).createHostedSession({ priceId: 'price_1', leadId: 'lead-1' })).rejects.toThrow(BadRequestException);
    expect(session.create).not.toHaveBeenCalled();
  });

  it('refuses when an account already exists for the lead email', async () => {
    await expect(build(prismaFor({ patient: { id: 'p-1' } }), stripe).createHostedSession({ priceId: 'price_1', leadId: 'lead-1' })).rejects.toThrow(BadRequestException);
  });

  it('saves delivery details and the chosen treatment on the lead, storing only whitelisted fields', async () => {
    const prisma = prismaFor();
    await build(prisma, stripe).createHostedSession({
      priceId: 'price_1',
      leadId: 'lead-1',
      product: 'Mounjaro',
      dose: '5 mg',
      shipping: { name: ' Ann Lee ', line1: '1 Main St', city: 'Pristina', postalCode: '10000', country: 'xk', referralRewardApplied: false } as any,
    });

    const data = prisma.lead.update.mock.calls[0][0].data;
    expect(data.checkoutDetails).toEqual({ name: 'Ann Lee', line1: '1 Main St', city: 'Pristina', postalCode: '10000', country: 'XK' });
    expect(data.quizAnswers).toEqual([
      { questionId: 'age', question: 'Age?', answer: '40 to 54' },
      { questionId: 'preferred_treatment', question: 'Preferred treatment (chosen at checkout)', answer: 'Mounjaro 5 mg' },
    ]);
  });

  it('replaces an earlier preferred medicine with the final treatment choice', async () => {
    const lead = { ...LEAD, quizAnswers: [{ questionId: 'preferred_medication', question: 'x', answer: 'Wegovy' }] };
    const prisma = prismaFor({ lead });
    await build(prisma, stripe).createHostedSession({ priceId: 'price_1', leadId: 'lead-1', product: 'Evorel', dose: '50 micrograms/24 h', addProgesterone: true });
    const answers = prisma.lead.update.mock.calls[0][0].data.quizAnswers;
    expect(answers).toHaveLength(1);
    expect(answers[0].answer).toBe('Evorel 50 micrograms/24 h + micronised progesterone');
  });
});

describe('CheckoutService.createSubscriptionIntent', () => {
  const invoice = { amount_due: 14900, currency: 'gbp', total_discount_amounts: [], payment_intent: { client_secret: 'pi_secret' } };
  function stripeWith(incomplete: any[]) {
    return {
      prices: { retrieve: jest.fn().mockResolvedValue({ currency: 'gbp' }) },
      customers: { list: jest.fn().mockResolvedValue({ data: [{ id: 'cus_1' }] }), update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: 'cus_new' }) },
      subscriptions: {
        list: jest.fn().mockResolvedValue({ data: incomplete }),
        cancel: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'sub_new', latest_invoice: invoice }),
      },
    };
  }

  it('does not reuse a customer locked to another currency', async () => {
    const stripe = stripeWith([]);
    stripe.customers.list.mockResolvedValue({ data: [{ id: 'cus_usd', currency: 'usd' }] });
    await build(prismaFor(), stripe).createSubscriptionIntent({ priceId: 'price_1', leadId: 'lead-1' } as any);

    expect(stripe.customers.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'buyer@b.com' }));
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_new' }));
  });

  it('reuses a customer in the same currency', async () => {
    const stripe = stripeWith([]);
    stripe.customers.list.mockResolvedValue({ data: [{ id: 'cus_usd', currency: 'usd' }, { id: 'cus_gbp', currency: 'gbp' }] });
    await build(prismaFor(), stripe).createSubscriptionIntent({ priceId: 'price_1', leadId: 'lead-1' } as any);

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_gbp' }));
  });

  it("acts on the lead's email and cancels only this lead's own unpaid subscriptions", async () => {
    const stripe = stripeWith([
      { id: 'sub_mine', metadata: { leadId: 'lead-1' } },
      { id: 'sub_other', metadata: { leadId: 'someone-else' } },
      { id: 'sub_legacy', metadata: {} },
    ]);
    await build(prismaFor(), stripe).createSubscriptionIntent({ priceId: 'price_1', leadId: 'lead-1', email: 'victim@x.com' } as any);

    expect(stripe.customers.list).toHaveBeenCalledWith({ email: 'buyer@b.com', limit: 10 });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_mine');
    expect(stripe.subscriptions.create.mock.calls[0][0].metadata.leadId).toBe('lead-1');
  });

  it('requires a valid lead', async () => {
    await expect(build(prismaFor({ lead: null }), stripeWith([])).createSubscriptionIntent({ priceId: 'price_1', leadId: 'nope' })).rejects.toThrow(BadRequestException);
    await expect(build(prismaFor(), stripeWith([])).createSubscriptionIntent({ priceId: 'price_1' })).rejects.toThrow(BadRequestException);
  });
});

describe('CheckoutService.saveShipping', () => {
  it('stores only the whitelisted address fields and updates the lead email\'s Stripe customer', async () => {
    const prisma = prismaFor();
    const stripe = {
      customers: { list: jest.fn().mockResolvedValue({ data: [{ id: 'cus_1' }] }), update: jest.fn().mockResolvedValue({}) },
    };
    await build(prisma, stripe).saveShipping({
      leadId: 'lead-1',
      shipping: { name: 'Ann Lee', line1: '1 Main St', city: 'Pristina', postalCode: '10000', country: 'XK', referralRewardApplied: false } as any,
    });

    expect(prisma.lead.update.mock.calls[0][0].data.checkoutDetails).toEqual({ name: 'Ann Lee', line1: '1 Main St', city: 'Pristina', postalCode: '10000', country: 'XK' });
    expect(stripe.customers.list).toHaveBeenCalledWith({ email: 'buyer@b.com', limit: 10 });
    expect(stripe.customers.update).toHaveBeenCalledWith('cus_1', expect.objectContaining({ name: 'Ann Lee' }));
  });

  it('refuses to change a lead that already paid, so a completed order can\'t be edited', async () => {
    const prisma = prismaFor({ lead: { ...LEAD, convertedAt: new Date() } });
    await expect(build(prisma, {}).saveShipping({ leadId: 'lead-1', shipping: { line1: 'x' } })).rejects.toThrow(BadRequestException);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});

describe('CheckoutService.rewardsFor', () => {
  it('offers the referral reward (with its Stripe amount) to a lead with a pending referral', async () => {
    const stripe = { coupons: { retrieve: jest.fn().mockResolvedValue({ amount_off: 2000, percent_off: null, currency: 'usd' }) } };
    const prisma = { referral: { findUnique: jest.fn().mockResolvedValue({ status: 'PENDING' }) } };
    const result = await build(prisma, stripe).rewardsFor('lead-1');
    expect(result.referralReward).toMatchObject({ amountOffCents: 2000, currency: 'usd' });
  });

  it('offers nothing to a lead without a pending referral', async () => {
    const prisma = { referral: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(build(prisma, {}).rewardsFor('lead-1')).resolves.toEqual({ referralReward: null });
  });
});

describe('CheckoutService.successInfo', () => {
  const prismaWith = (patient: any) => ({ patient: { findFirst: jest.fn().mockResolvedValue(patient) } });

  it('returns the first name and referral link for a paid session once the patient exists', async () => {
    const stripe = {
      checkout: { sessions: { retrieve: jest.fn().mockResolvedValue({ payment_status: 'paid', customer_details: { email: 'a@b.com' } }) } },
    };
    const referrals = { referralLinkFor: jest.fn().mockResolvedValue('http://site/?ref=CODE') };
    const result = await build(prismaWith({ id: 'p-1', firstName: 'Ann', email: 'a@b.com' }), stripe, referrals).successInfo({ sessionId: 'cs_1' });

    expect(result).toEqual({ ready: true, firstName: 'Ann', email: 'a@b.com', referralLink: 'http://site/?ref=CODE' });
  });

  it('says not ready while the webhook has not created the patient yet', async () => {
    const stripe = {
      checkout: { sessions: { retrieve: jest.fn().mockResolvedValue({ payment_status: 'paid', customer_details: { email: 'a@b.com' } }) } },
    };
    await expect(build(prismaWith(null), stripe).successInfo({ sessionId: 'cs_1' })).resolves.toEqual({ ready: false });
  });

  it('resolves the email from the customer for an inline payment intent', async () => {
    const stripe = {
      paymentIntents: { retrieve: jest.fn().mockResolvedValue({ status: 'succeeded', customer: { email: 'a@b.com' } }) },
    };
    const prisma = prismaWith({ id: 'p-1', firstName: 'Ann', email: 'a@b.com' });
    const referrals = { referralLinkFor: jest.fn().mockResolvedValue('link') };
    const result = await build(prisma, stripe, referrals).successInfo({ paymentIntentId: 'pi_1' });

    expect(result.ready).toBe(true);
    expect(prisma.patient.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'a@b.com', mode: 'insensitive' } } }));
  });

  it('rejects an unpaid session', async () => {
    const stripe = { checkout: { sessions: { retrieve: jest.fn().mockResolvedValue({ payment_status: 'unpaid' }) } } };
    await expect(build(prismaWith(null), stripe).successInfo({ sessionId: 'cs_1' })).rejects.toThrow(BadRequestException);
  });

  it('requires an id', async () => {
    await expect(build(prismaWith(null), {}).successInfo({})).rejects.toThrow(BadRequestException);
  });
});

describe('CheckoutService referral coupon currency', () => {
  const invoice = { amount_due: 4500, currency: 'eur', total_discount_amounts: [{ amount: 2000 }], payment_intent: { client_secret: 'pi_secret' } };
  function stripeWith(coupon: any) {
    return {
      prices: { retrieve: jest.fn().mockResolvedValue({ currency: 'eur' }) },
      coupons: { retrieve: jest.fn().mockResolvedValue(coupon) },
      customers: { list: jest.fn().mockResolvedValue({ data: [{ id: 'cus_1' }] }), update: jest.fn(), create: jest.fn() },
      subscriptions: { list: jest.fn().mockResolvedValue({ data: [] }), cancel: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'sub_1', latest_invoice: invoice }) },
    };
  }
  const run = (stripe: any) =>
    build(prismaFor({ referral: { status: 'PENDING' } }), stripe).createSubscriptionIntent({ priceId: 'price_1', leadId: 'lead-1', applyReward: true } as any);

  it('refuses a fixed-amount coupon in another currency, with a clear message', async () => {
    const stripe = stripeWith({ amount_off: 2000, currency: 'usd' });
    await expect(run(stripe)).rejects.toThrow(/referral reward can’t be applied/);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it('accepts a coupon that lists the order currency', async () => {
    await run(stripeWith({ amount_off: 2000, currency: 'usd', currency_options: { eur: { amount_off: 1800 } } }));
  });

  it('accepts a percentage coupon in any currency', async () => {
    await run(stripeWith({ amount_off: null, percent_off: 20, currency: null }));
  });
});

describe('CheckoutService referral coupon per currency', () => {
  const invoice = { amount_due: 4500, currency: 'eur', total_discount_amounts: [{ amount: 2000 }], payment_intent: { client_secret: 'pi_secret' } };
  function stripeWith() {
    return {
      prices: { retrieve: jest.fn().mockResolvedValue({ currency: 'eur' }) },
      coupons: { retrieve: jest.fn().mockResolvedValue({ amount_off: 2000, currency: 'eur' }) },
      customers: { list: jest.fn().mockResolvedValue({ data: [{ id: 'cus_1' }] }), update: jest.fn(), create: jest.fn() },
      subscriptions: { list: jest.fn().mockResolvedValue({ data: [] }), cancel: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'sub_1', latest_invoice: invoice }) },
    };
  }
  const withSettings = (extra: Record<string, string>) => {
    const original = config.get.getMockImplementation()!;
    config.get.mockImplementation((key: string, def?: any) => extra[key] ?? original(key, def));
    return () => config.get.mockImplementation(original);
  };

  it('uses the coupon for the order’s currency when one is set', async () => {
    const restore = withSettings({ STRIPE_REFERRAL_FRIEND_COUPON_ID_EUR: 'coupon_eur' });
    const stripe = stripeWith();
    await build(prismaFor({ referral: { status: 'PENDING' } }), stripe).createSubscriptionIntent({ priceId: 'price_1', leadId: 'lead-1', applyReward: true } as any);
    restore();
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({ discounts: [{ coupon: 'coupon_eur' }] }));
  });

  it('falls back to the single coupon id when there is none for that currency', async () => {
    const stripe = stripeWith();
    await build(prismaFor({ referral: { status: 'PENDING' } }), stripe).createSubscriptionIntent({ priceId: 'price_1', leadId: 'lead-1', applyReward: true } as any);
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({ discounts: [{ coupon: 'coupon_ref' }] }));
  });

  it('describes the offer from the euro coupon', async () => {
    const restore = withSettings({ STRIPE_REFERRAL_FRIEND_COUPON_ID_EUR: 'coupon_eur' });
    const stripe = stripeWith();
    await build(prismaFor({ referral: { status: 'PENDING' } }), stripe).rewardsFor('lead-1');
    restore();
    expect(stripe.coupons.retrieve).toHaveBeenCalledWith('coupon_eur');
  });
});
