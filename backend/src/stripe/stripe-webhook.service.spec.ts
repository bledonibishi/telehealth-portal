import { StripeWebhookService } from './stripe-webhook.service';

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hash') }));

const config = { get: jest.fn((_k: string, def?: any) => def) };

function build(leadOver: Record<string, unknown> = {}) {
  const lead = {
    id: 'lead-1',
    email: 'buyer@b.com',
    firstName: 'Ann',
    lastName: 'Lee',
    convertedAt: null,
    checkoutDetails: { line1: '1 Main St', city: 'Pristina', postalCode: '10000', country: 'XK' },
    ...leadOver,
  };
  const patient = { id: 'p-1', email: 'buyer@b.com', firstName: 'Ann' };
  const prisma = {
    lead: { findUnique: jest.fn().mockResolvedValue(lead), update: jest.fn().mockResolvedValue({}) },
    patient: { upsert: jest.fn().mockResolvedValue(patient), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
  };
  const email = { sendActivationEmail: jest.fn().mockResolvedValue(undefined) };
  const referrals = { handleConversion: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const submitFromLead = jest.fn().mockResolvedValue({ id: 'c-1' });
  const moduleRef = { get: jest.fn().mockReturnValue({ submitFromLead }) };
  const service = new StripeWebhookService(prisma as any, email as any, config as any, referrals as any, audit as any, moduleRef as any);
  return { service, prisma, referrals, lead, audit, submitFromLead };
}

const sessionEvent = (amountDiscount: number) =>
  ({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', customer_details: { email: 'buyer@b.com' }, customer: 'cus_1', subscription: 'sub_1', total_details: { amount_discount: amountDiscount } } },
  }) as any;

const invoiceEvent = (discounts: Array<{ amount: number }>) =>
  ({
    type: 'invoice.payment_succeeded',
    data: { object: { id: 'in_1', customer_email: 'buyer@b.com', customer: 'cus_1', subscription: 'sub_1', total_discount_amounts: discounts } },
  }) as any;

describe('StripeWebhookService reward detection', () => {
  it('marks the friend reward applied when Stripe actually discounted the checkout session', async () => {
    const { service, referrals } = build();
    await service.handle(sessionEvent(2000));
    expect(referrals.handleConversion).toHaveBeenCalledWith(expect.objectContaining({ id: 'lead-1' }), expect.anything(), { friendRewardApplied: true });
  });

  it('leaves it unapplied when the payment had no discount, whatever the lead record says', async () => {
    const { service, referrals } = build({ checkoutDetails: { referralRewardApplied: true } });
    await service.handle(sessionEvent(0));
    expect(referrals.handleConversion).toHaveBeenCalledWith(expect.anything(), expect.anything(), { friendRewardApplied: false });
  });

  it('reads the discount from the invoice for the inline Payment Element flow', async () => {
    const applied = build();
    await applied.service.handle(invoiceEvent([{ amount: 2000 }]));
    expect(applied.referrals.handleConversion).toHaveBeenCalledWith(expect.anything(), expect.anything(), { friendRewardApplied: true });

    const full = build();
    await full.service.handle(invoiceEvent([]));
    expect(full.referrals.handleConversion).toHaveBeenCalledWith(expect.anything(), expect.anything(), { friendRewardApplied: false });
  });

  it('copies the delivery address saved at checkout onto the new patient', async () => {
    const { service, prisma } = build();
    await service.handle(sessionEvent(0));
    expect(prisma.patient.upsert.mock.calls[0][0].create).toMatchObject({ addressLine1: '1 Main St', city: 'Pristina', postcode: '10000', country: 'XK' });
  });
});

describe('StripeWebhookService website questionnaire', () => {
  it('turns the questionnaire answered before payment into the consultation for the new patient', async () => {
    const { service, submitFromLead } = build();
    await service.handle(sessionEvent(0));
    expect(submitFromLead).toHaveBeenCalledWith('p-1');
  });

  it('tries again on a later payment event when it failed the first time', async () => {
    const { service, submitFromLead } = build({ convertedAt: new Date() });
    await service.handle(sessionEvent(0));
    expect(submitFromLead).toHaveBeenCalledWith('p-1');
  });

  it('still activates the patient when creating the consultation fails', async () => {
    const { service, submitFromLead, referrals } = build();
    submitFromLead.mockRejectedValue(new Error('boom'));
    await service.handle(sessionEvent(0));
    expect(referrals.handleConversion).toHaveBeenCalled();
  });
});

describe('StripeWebhookService subscription ended', () => {
  const deleted = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1' } } } as any;

  it('stops further supplies and records it when a patient’s subscription ends', async () => {
    const { service, prisma, audit } = build();
    await service.handle(deleted);
    expect(prisma.patient.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { stripeSubscriptionId: 'sub_1' } }));
    expect(prisma.patient.updateMany).toHaveBeenCalledWith({ where: { id: 'p-1', subscriptionEndedAt: null }, data: { subscriptionEndedAt: expect.any(Date) } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUBSCRIPTION_ENDED', resourceType: 'Patient', resourceId: 'p-1' }));
  });

  it('ignores a subscription that belongs to no patient (an abandoned checkout)', async () => {
    const { service, prisma, audit } = build();
    prisma.patient.findFirst.mockResolvedValue(null);
    await service.handle(deleted);
    expect(prisma.patient.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('records it once when Stripe delivers the event twice', async () => {
    const { service, prisma, audit } = build();
    prisma.patient.updateMany.mockResolvedValue({ count: 0 });
    await service.handle(deleted);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
