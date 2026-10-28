import { StripeWebhookService } from './stripe-webhook.service';

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hash') }));

const config = { get: jest.fn((_k: string, def?: any) => def) };

function build(leadOver: Record<string, unknown> = {}, existing: Record<string, unknown> | null = null) {
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
    lead: { findUnique: jest.fn().mockResolvedValue(lead), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    patient: { findUnique: jest.fn().mockResolvedValue(existing), upsert: jest.fn().mockResolvedValue(patient), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
    onboardingSubmission: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  (prisma as any).$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const email = { sendActivationEmail: jest.fn().mockResolvedValue(undefined), sendWelcomeBackEmail: jest.fn().mockResolvedValue(undefined), sendPaymentReceiptEmail: jest.fn().mockResolvedValue(undefined) };
  const referrals = { handleConversion: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const submitFromLead = jest.fn().mockResolvedValue({ id: 'c-1' });
  const moduleRef = { get: jest.fn().mockReturnValue({ submitFromLead }) };
  const service = new StripeWebhookService(prisma as any, email as any, config as any, referrals as any, audit as any, moduleRef as any);
  return { service, prisma, referrals, lead, audit, submitFromLead, email, moduleRef };
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

describe('StripeWebhookService payment receipt', () => {
  const paid = (amount_total: number) => ({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', customer_details: { email: 'buyer@b.com' }, customer: 'cus_1', subscription: 'sub_1', total_details: { amount_discount: 0 }, amount_total, currency: 'eur' } } }) as any;

  it('emails a receipt with what was charged after the first payment', async () => {
    const { service, email } = build();
    await service.handle(paid(4200));
    expect(email.sendPaymentReceiptEmail).toHaveBeenCalledWith('buyer@b.com', 'Ann', expect.objectContaining({ amount: 4200, currency: 'eur' }));
  });

  it('sends none for a payment of nothing, and none for a payment after the first', async () => {
    const free = build();
    await free.service.handle(paid(0));
    expect(free.email.sendPaymentReceiptEmail).not.toHaveBeenCalled();
    const repeat = build({ convertedAt: new Date() });
    await repeat.service.handle(paid(4200));
    expect(repeat.email.sendPaymentReceiptEmail).not.toHaveBeenCalled();
  });

  it('does not fail the payment when the receipt cannot be sent', async () => {
    const { service, email } = build();
    email.sendPaymentReceiptEmail.mockRejectedValue(new Error('down'));
    await expect(service.handle(paid(4200))).resolves.toBeUndefined();
  });
});

describe('StripeWebhookService one payment, one receipt', () => {
  const paidOn = (created: number) => ({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', created, customer_details: { email: 'buyer@b.com' }, customer: 'cus_1', subscription: 'sub_1', total_details: { amount_discount: 0 }, amount_total: 4200, currency: 'eur' } } }) as any;

  it('dates the receipt by when Stripe took the payment, not by when the event was processed', async () => {
    const { service, email } = build();
    const paidAt = Date.UTC(2026, 9, 1, 10) / 1000;
    await service.handle(paidOn(paidAt));
    expect(email.sendPaymentReceiptEmail).toHaveBeenCalledWith('buyer@b.com', 'Ann', expect.objectContaining({ paidAt: new Date(paidAt * 1000) }));
  });

  it('still sends it when a later step (the referral reward) fails and the event is retried', async () => {
    const { service, email, referrals } = build();
    referrals.handleConversion.mockRejectedValue(new Error('db down'));
    await expect(service.handle(paidOn(1_790_000_000))).rejects.toThrow('db down');
    expect(email.sendPaymentReceiptEmail).toHaveBeenCalledTimes(1);
  });

  it('sends nothing twice when two events for one payment arrive together: only the one that claims the lead goes on', async () => {
    const { service, prisma, email } = build();
    prisma.lead.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await Promise.all([service.handle(paidOn(1_790_000_000)), service.handle(paidOn(1_790_000_000))]);
    expect(prisma.patient.upsert).toHaveBeenCalledTimes(1);
    expect(email.sendActivationEmail).toHaveBeenCalledTimes(1);
    expect(email.sendPaymentReceiptEmail).toHaveBeenCalledTimes(1);
  });
});

describe('StripeWebhookService payments after the first', () => {
  const withNotifier = () => {
    const base = build();
    const notifier = { toPatient: jest.fn().mockResolvedValue(undefined) };
    const markPaid = jest.fn().mockResolvedValue(true);
    base.service['moduleRef'] = { get: jest.fn((token: any) => (token?.name === 'NotifierService' ? notifier : token?.name === 'OrdersService' ? { markPaid } : { submitFromLead: base.submitFromLead })) } as any;
    (base.email as any).sendPaymentFailedEmail = jest.fn().mockResolvedValue(undefined);
    return { ...base, notifier, markPaid };
  };
  const failed = (over: Record<string, unknown> = {}) => ({ type: 'invoice.payment_failed', data: { object: { id: 'in_f', customer: 'cus_1', subscription: 'sub_1', metadata: {}, ...over } } }) as any;

  it('holds a patient’s supplies and tells them when a renewal fails', async () => {
    const { service, prisma, notifier, email } = withNotifier();
    prisma.patient.findFirst.mockResolvedValue({ id: 'p-1', email: 'buyer@b.com', firstName: 'Ann' });
    await service.handle(failed());
    expect(prisma.patient.updateMany).toHaveBeenCalledWith({ where: { id: 'p-1', paymentFailedAt: null }, data: { paymentFailedAt: expect.any(Date) } });
    expect(notifier.toPatient).toHaveBeenCalledWith('p-1', expect.objectContaining({ kind: 'PAYMENT_FAILED' }));
    expect((email as any).sendPaymentFailedEmail).toHaveBeenCalledWith('buyer@b.com', 'Ann', expect.stringMatching(/\/settings$/));
  });

  it('tells them once, not on every retry Stripe makes', async () => {
    const { service, prisma, notifier } = withNotifier();
    prisma.patient.updateMany.mockResolvedValue({ count: 0 }); // already held
    await service.handle(failed());
    expect(notifier.toPatient).not.toHaveBeenCalled();
  });

  it('ignores a supply invoice a patient chose to pay for, and a payment with no subscription', async () => {
    const { service, prisma } = withNotifier();
    await service.handle(failed({ metadata: { kind: 'SUPPLY' } }));
    await service.handle(failed({ subscription: null }));
    expect(prisma.patient.findFirst).not.toHaveBeenCalled();
  });

  it('ignores a payment that failed before the person was a patient', async () => {
    const { service, prisma, notifier } = withNotifier();
    prisma.patient.findFirst.mockResolvedValue(null);
    await service.handle(failed());
    expect(notifier.toPatient).not.toHaveBeenCalled();
  });

  it('lifts the hold when a payment then goes through', async () => {
    const { service, prisma } = withNotifier();
    await service.handle(invoiceEvent([]));
    expect(prisma.patient.updateMany).toHaveBeenCalledWith({ where: { stripeCustomerId: 'cus_1', paymentFailedAt: { not: null } }, data: { paymentFailedAt: null } });
  });

  it('releases a supply that was paid for, and does not treat it as a new patient', async () => {
    const { service, prisma, markPaid } = withNotifier();
    await service.handle({ type: 'invoice.payment_succeeded', data: { object: { id: 'in_s', customer: 'cus_1', metadata: { kind: 'SUPPLY', orderId: 'o-1' } } } } as any);
    expect(markPaid).toHaveBeenCalledWith('in_s');
    expect(prisma.lead.findUnique).not.toHaveBeenCalled();
  });

  it('marks a patient who paid once as paying per supply', async () => {
    const { service, prisma } = withNotifier();
    await service.handle({ type: 'invoice.payment_succeeded', data: { object: { id: 'in_o', customer_email: 'buyer@b.com', customer: 'cus_1', subscription: null, metadata: { billing: 'ONE_TIME' }, total_discount_amounts: [] } } } as any);
    expect(prisma.patient.upsert.mock.calls[0][0].create).toMatchObject({ paysPerSupply: true });
  });
});

describe('StripeWebhookService a patient who comes back', () => {
  const returning = { id: 'p-1', activatedAt: new Date('2026-01-01') };

  it('keeps their account and password: a welcome back, no activation link', async () => {
    const { service, prisma, email } = build({}, returning);
    await service.handle(sessionEvent(0));
    const update = prisma.patient.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty('activationToken');
    expect(update).toMatchObject({ accessClosedAt: null, subscriptionEndedAt: null });
    expect(email.sendWelcomeBackEmail).toHaveBeenCalledWith('buyer@b.com', 'Ann', expect.objectContaining({ idCheckNeeded: false }));
    expect(email.sendActivationEmail).not.toHaveBeenCalled();
  });

  it('puts the new delivery address on the account', async () => {
    const { service, prisma } = build({}, returning);
    await service.handle(sessionEvent(0));
    expect(prisma.patient.upsert.mock.calls[0][0].update).toMatchObject({ addressLine1: '1 Main St', city: 'Pristina', postcode: '10000', country: 'XK' });
  });

  it('asks for the ID again when the check is more than a year old, and says so', async () => {
    const { service, prisma, email } = build({}, returning);
    prisma.onboardingSubmission.updateMany.mockResolvedValue({ count: 1 });
    await service.handle(sessionEvent(0));
    expect(prisma.onboardingSubmission.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS', idDocumentFileId: null, selfieFileId: null }) }));
    expect(email.sendWelcomeBackEmail).toHaveBeenCalledWith('buyer@b.com', 'Ann', expect.objectContaining({ idCheckNeeded: true }));
  });

  it('still activates a new patient the usual way', async () => {
    const { service, email } = build();
    await service.handle(sessionEvent(0));
    expect(email.sendActivationEmail).toHaveBeenCalledTimes(1);
    expect(email.sendWelcomeBackEmail).not.toHaveBeenCalled();
  });
});

describe('StripeWebhookService a returning patient\'s subscription', () => {
  it('releases the order they were waiting on, and is not an activation', async () => {
    const { service, prisma, email, moduleRef } = build();
    const markReturnSubscribed = jest.fn().mockResolvedValue(true);
    moduleRef.get.mockReturnValue({ markReturnSubscribed });
    await service.handle({
      type: 'invoice.payment_succeeded',
      data: { object: { id: 'in_9', customer_email: 'buyer@b.com', customer: 'cus_1', subscription: 'sub_9', subscription_details: { metadata: { kind: 'RETURN_SUBSCRIPTION', returnOrderId: 'o-7' } } } },
    } as any);
    expect(markReturnSubscribed).toHaveBeenCalledWith('o-7', 'sub_9', 'cus_1');
    expect(prisma.patient.upsert).not.toHaveBeenCalled();
    expect(email.sendActivationEmail).not.toHaveBeenCalled();
  });
});

describe('StripeWebhookService shop purchases', () => {
  it('hands a shop checkout to the shop and never activates a patient for it', async () => {
    const { service, prisma, moduleRef, email } = build();
    const onProviderNotice = jest.fn().mockResolvedValue({ handled: true });
    moduleRef.get.mockReturnValue({ onProviderNotice });
    await service.handle({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_shop', metadata: { kind: 'shop' }, customer_details: { email: 'buyer@b.com' }, amount_total: 2990, currency: 'eur' } },
    } as any);
    expect(onProviderNotice).toHaveBeenCalledWith('STRIPE', 'cs_shop');
    expect(prisma.lead.findUnique).not.toHaveBeenCalled();
    expect(prisma.patient.upsert).not.toHaveBeenCalled();
    expect(email.sendPaymentReceiptEmail).not.toHaveBeenCalled();
  });
});
