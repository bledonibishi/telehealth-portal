import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

// The real Stripe SDK throws at construction with no key; every test replaces
// `stripe` with a spy before any call.
const config = {
  get: jest.fn((key: string, def?: any) =>
    key === 'STRIPE_SECRET_KEY' ? 'sk_test_dummy' : key === 'STRIPE_REFERRAL_FRIEND_COUPON_ID' ? 'coupon_ref' : def,
  ),
};

function build(prisma: any, stripe: any, referrals: any = { referralLinkFor: jest.fn() }) {
  const service = new CheckoutService(config as any, prisma, referrals);
  (service as any).stripe = stripe;
  return service;
}

describe('CheckoutService.createHostedSession', () => {
  const session = { create: jest.fn().mockResolvedValue({ url: 'https://stripe/x' }) };
  const stripe = { checkout: { sessions: session } };
  const prismaWith = (referral: any) => ({
    referral: { findUnique: jest.fn().mockResolvedValue(referral) },
    lead: { findUnique: jest.fn().mockResolvedValue({ checkoutDetails: null }), update: jest.fn().mockResolvedValue({}) },
  });

  beforeEach(() => jest.clearAllMocks());

  it('redirects back to the website success/cancel pages and prefills the email', async () => {
    await build(prismaWith(null), stripe).createHostedSession({ priceId: 'price_1', leadId: 'lead-1', email: 'a@b.com', product: 'wegovy', dose: '0.25 mg' });

    const args = session.create.mock.calls[0][0];
    expect(args.success_url).toBe('http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}');
    expect(args.cancel_url).toBe('http://localhost:3000/checkout/cancel');
    expect(args.customer_email).toBe('a@b.com');
    expect(args.metadata).toMatchObject({ product: 'wegovy', dose: '0.25 mg', email: 'a@b.com' });
    expect(args.allow_promotion_codes).toBe(true);
    expect(args.discounts).toBeUndefined();
  });

  it('does not attach the referral coupon unless the customer applied the reward', async () => {
    await build(prismaWith({ status: 'PENDING' }), stripe).createHostedSession({ priceId: 'price_1', leadId: 'lead-1' });
    expect(session.create.mock.calls[0][0].discounts).toBeUndefined();
  });

  it('attaches the referral coupon (and drops promo codes) when the reward is applied', async () => {
    const prisma = prismaWith({ status: 'PENDING' });
    await build(prisma, stripe).createHostedSession({ priceId: 'price_1', leadId: 'lead-1', applyReward: true, shipping: { line1: '1 Main St', city: 'Pristina', postalCode: '10000', country: 'XK' } });

    const args = session.create.mock.calls[0][0];
    expect(args.discounts).toEqual([{ coupon: 'coupon_ref' }]);
    expect(args.allow_promotion_codes).toBeUndefined();
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { checkoutDetails: { line1: '1 Main St', city: 'Pristina', postalCode: '10000', country: 'XK', referralRewardApplied: true } },
    });
  });
});

describe('CheckoutService.saveShipping', () => {
  it('merges the address into the lead without losing the reward flag', async () => {
    const prisma = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({ checkoutDetails: { referralRewardApplied: true } }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const stripe = {
      customers: { list: jest.fn().mockResolvedValue({ data: [{ id: 'cus_1' }] }), update: jest.fn().mockResolvedValue({}) },
    };
    await build(prisma, stripe).saveShipping({ leadId: 'lead-1', email: 'a@b.com', shipping: { name: 'Ann Lee', line1: '1 Main St', city: 'Pristina', postalCode: '10000', country: 'XK' } });

    expect(prisma.lead.update.mock.calls[0][0].data.checkoutDetails).toMatchObject({ referralRewardApplied: true, line1: '1 Main St', postalCode: '10000' });
    expect(stripe.customers.update).toHaveBeenCalledWith('cus_1', expect.objectContaining({ name: 'Ann Lee' }));
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
