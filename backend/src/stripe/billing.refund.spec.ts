import { BillingService } from './billing.service';

const PATIENT = { email: 'p@example.com', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' };

function build({ status = 'active', invoices = [{ id: 'in_1', amount_paid: 4200, payment_intent: 'pi_1' }] as any[], refundError }: { status?: string; invoices?: any[]; refundError?: any } = {}) {
  const stripe = {
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue({ id: 'sub_1', status }),
      cancel: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
    customers: { list: jest.fn().mockResolvedValue({ data: [] }) },
    invoices: { list: jest.fn().mockResolvedValue({ data: invoices }) },
    refunds: { create: refundError ? jest.fn().mockRejectedValue(refundError) : jest.fn().mockResolvedValue({ id: 're_1' }) },
  };
  const billing = new BillingService({ get: () => 'sk_test' } as any);
  (billing as any).stripe = stripe;
  return { billing, stripe };
}

describe('BillingService.cancelAndRefund (a declined patient)', () => {
  it('cancels the subscription and refunds the payment', async () => {
    const { billing, stripe } = build();
    expect(await billing.cancelAndRefund(PATIENT)).toEqual({ status: 'REFUNDED', subscriptionId: 'sub_1', refundId: 're_1' });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1');
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, { idempotencyKey: 'decline-refund-in_1' });
  });

  it('refunds a payment made against a charge too', async () => {
    const { billing, stripe } = build({ invoices: [{ id: 'in_1', amount_paid: 4200, charge: 'ch_1' }] });
    await billing.cancelAndRefund(PATIENT);
    expect(stripe.refunds.create).toHaveBeenCalledWith({ charge: 'ch_1' }, expect.anything());
  });

  it('is safe to repeat: an already refunded payment still reads as refunded', async () => {
    const { billing } = build({ status: 'canceled', refundError: Object.assign(new Error('x'), { code: 'charge_already_refunded' }) });
    const result = await billing.cancelAndRefund(PATIENT);
    expect(result).toMatchObject({ status: 'REFUNDED', refundId: null });
  });

  it('does not call it a refund when nothing had been charged', async () => {
    const { billing, stripe } = build({ invoices: [] });
    expect((await billing.cancelAndRefund(PATIENT)).status).toBe('NOT_REQUIRED');
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect((await build({ invoices: [{ id: 'in_0', amount_paid: 0 }] }).billing.cancelAndRefund(PATIENT)).status).toBe('NOT_REQUIRED');
  });

  it('reports a failure, never a refund, when money was taken but can’t be refunded automatically', async () => {
    const { billing } = build({ invoices: [{ id: 'in_1', amount_paid: 4200 }] });
    expect(await billing.cancelAndRefund(PATIENT)).toMatchObject({ status: 'FAILED', error: expect.stringContaining('refund it in Stripe') });
  });

  it('reports a failure when Stripe refuses the refund', async () => {
    const { billing } = build({ refundError: new Error('card_declined') });
    expect(await billing.cancelAndRefund(PATIENT)).toMatchObject({ status: 'FAILED', error: 'card_declined' });
  });

  it('has nothing to refund for a patient with no subscription (for instance one created by an admin)', async () => {
    const { billing, stripe } = build();
    const result = await billing.cancelAndRefund({ email: 'a@b.com', stripeCustomerId: null, stripeSubscriptionId: null });
    expect(result.status).toBe('NOT_REQUIRED');
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it('refuses to claim a refund when Stripe isn’t set up', async () => {
    const { billing } = build();
    (billing as any).configured = false;
    expect(await billing.cancelAndRefund(PATIENT)).toMatchObject({ status: 'FAILED' });
  });
});

describe('refund email', () => {
  const settle = () => new Promise((r) => setImmediate(r));
  function withEmail(refund: any = { id: 're_1', amount: 4200, currency: 'eur' }) {
    const { billing, stripe } = build();
    stripe.refunds.create.mockResolvedValue(refund);
    const email = { sendRefundEmail: jest.fn().mockResolvedValue(undefined) };
    (billing as any).email = email;
    return { billing, stripe, email };
  }

  it('tells the patient how much is coming back after a declined consultation', async () => {
    const { billing, email } = withEmail();
    await billing.cancelAndRefund({ ...PATIENT, firstName: 'Tia' });
    await settle();
    expect(email.sendRefundEmail).toHaveBeenCalledWith('p@example.com', 'Tia', { amount: 4200, currency: 'eur' });
  });

  it('tells them after an approved refund request too', async () => {
    const { billing, stripe, email } = withEmail();
    stripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', status: 'active' });
    await billing.refundLatestPaymentResult(PATIENT);
    await settle();
    expect(email.sendRefundEmail).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the payment was already refunded (a retry), so nobody is told twice', async () => {
    const { billing, stripe, email } = withEmail();
    stripe.refunds.create.mockRejectedValue(Object.assign(new Error('x'), { code: 'charge_already_refunded' }));
    await billing.cancelAndRefund(PATIENT);
    await settle();
    expect(email.sendRefundEmail).not.toHaveBeenCalled();
  });

  it('sends nothing when Stripe replays the refund it already made for the same request (an immediate retry)', async () => {
    const { billing, email } = withEmail({ id: 're_1', amount: 4200, currency: 'eur', lastResponse: { headers: { 'idempotent-replayed': 'true' } } });
    await billing.cancelAndRefund(PATIENT);
    await settle();
    expect(email.sendRefundEmail).not.toHaveBeenCalled();
  });

  it('does not undo or fail the refund when the email cannot be sent', async () => {
    const { billing, email } = withEmail();
    email.sendRefundEmail.mockRejectedValue(new Error('down'));
    expect((await billing.cancelAndRefund(PATIENT)).status).toBe('REFUNDED');
    await settle();
  });
});

describe('a patient who paid once (a customer with no subscription)', () => {
  const ONCE = { email: 'p@example.com', stripeCustomerId: 'cus_1', stripeSubscriptionId: null };

  it('is refunded from their own latest paid invoice when a clinician declines', async () => {
    const { billing, stripe } = build();
    expect(await billing.cancelAndRefund(ONCE)).toEqual({ status: 'REFUNDED', subscriptionId: null, refundId: 're_1' });
    expect(stripe.invoices.list).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1', status: 'paid' }));
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, { idempotencyKey: 'decline-refund-in_1' });
  });

  it('says there is nothing to refund when nothing was paid', async () => {
    const { billing, stripe } = build({ invoices: [] });
    expect((await billing.cancelAndRefund(ONCE)).status).toBe('NOT_REQUIRED');
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it('approves a refund request: refunds the latest payment', async () => {
    const { billing, stripe } = build();
    expect(await billing.refundLatestPaymentResult(ONCE)).toEqual({ ok: true, note: 'Refunded the latest payment (re_1)' });
    expect(stripe.invoices.list).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1' }));
  });

  it('is told there is nothing to cancel, which is not a failure', async () => {
    const { billing } = build();
    expect(await billing.cancelAtPeriodEndResult(ONCE)).toEqual({ ok: true, note: expect.stringMatching(/Nothing to cancel/) });
  });

  it('is still a failure to cancel for someone Stripe does not know at all', async () => {
    const { billing } = build();
    const result = await billing.cancelAtPeriodEndResult({ email: 'x@example.com', stripeCustomerId: null, stripeSubscriptionId: null });
    expect(result.ok).toBe(false);
  });
});

describe('BillingService.subscriptionState', () => {
  const state = (sub: any) => {
    const { billing, stripe } = build();
    stripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', ...sub });
    return billing.subscriptionState(PATIENT);
  };

  it('says a running subscription is running', async () => {
    expect(await state({ status: 'active', cancel_at_period_end: false })).toEqual({ status: 'active', endsAtPeriodEnd: false, endsAt: null });
  });

  it('remembers that it has been stopped, and when the paid period ends', async () => {
    const result = await state({ status: 'active', cancel_at_period_end: true, current_period_end: 1_800_000_000 });
    expect(result).toEqual({ status: 'active', endsAtPeriodEnd: true, endsAt: new Date(1_800_000_000 * 1000) });
  });

  it('treats a cancelled one as ended', async () => {
    expect((await state({ status: 'canceled', cancel_at_period_end: false }))?.endsAtPeriodEnd).toBe(true);
  });

  it('is null for a patient with no subscription', async () => {
    const { billing } = build();
    expect(await billing.subscriptionState({ email: 'x@example.com', stripeCustomerId: null, stripeSubscriptionId: null })).toBeNull();
  });
});

describe('the prescription fee in a refund', () => {
  const PAID_AT = 1_800_000_000; // seconds
  const withFee = (over: any = {}) => ({
    id: 'in_1', amount_paid: 13500, currency: 'eur', payment_intent: 'pi_1', status_transitions: { paid_at: PAID_AT },
    lines: { data: [{ description: '1 × Wegovy 0.25mg', amount: 9500 }, { description: 'Prescription fee', amount: 4000 }] }, ...over,
  });
  const after = new Date((PAID_AT + 3600) * 1000);
  const before = new Date((PAID_AT - 7200) * 1000);

  it('keeps the fee when a prescription was written after the payment: a partial refund of the rest', async () => {
    const { billing, stripe } = build({ invoices: [withFee()] });
    const result = await billing.refundLatestPaymentResult(PATIENT, { prescriptionIssuedAt: after });
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1', amount: 9500 }, { idempotencyKey: 'decline-refund-in_1-keep-4000' });
    expect(result).toMatchObject({ ok: true, note: expect.stringMatching(/except the 40\.00 prescription fee/) });
  });

  it('returns everything, fee included, when no prescription was written yet', async () => {
    const { billing, stripe } = build({ invoices: [withFee()] });
    await billing.refundLatestPaymentResult(PATIENT, { prescriptionIssuedAt: null });
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, { idempotencyKey: 'decline-refund-in_1' });
  });

  it('returns everything when the only prescription is from before this payment', async () => {
    const { billing, stripe } = build({ invoices: [withFee()] });
    await billing.refundLatestPaymentResult(PATIENT, { prescriptionIssuedAt: before });
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, expect.anything());
  });

  it('refunds nothing, and says why, when only the fee was paid', async () => {
    const { billing, stripe } = build({ invoices: [withFee({ amount_paid: 4000, lines: { data: [{ description: 'Prescription fee', amount: 4000 }] } })] });
    const result = await billing.refundLatestPaymentResult(PATIENT, { prescriptionIssuedAt: after });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, note: expect.stringMatching(/only the prescription fee/) });
  });

  it('does not touch a payment that had no fee (an older patient)', async () => {
    const { billing, stripe } = build({ invoices: [{ id: 'in_1', amount_paid: 9900, payment_intent: 'pi_1', status_transitions: { paid_at: PAID_AT }, lines: { data: [{ description: '1 × Wegovy', amount: 9900 }] } }] });
    await billing.refundLatestPaymentResult(PATIENT, { prescriptionIssuedAt: after });
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, expect.anything());
  });

  it('shows the admin what a refund would return and what it would keep', async () => {
    const { billing } = build({ invoices: [withFee()] });
    expect(await billing.previewRefund(PATIENT, { prescriptionIssuedAt: after })).toEqual({ amountCents: 9500, feeKeptCents: 4000, currency: 'eur' });
    expect(await billing.previewRefund(PATIENT, { prescriptionIssuedAt: null })).toEqual({ amountCents: 13500, feeKeptCents: 0, currency: 'eur' });
  });
});


describe('BillingService.createSupplyInvoice with the prescription fee', () => {
  function supplyStripe() {
    return {
      customers: { list: jest.fn().mockResolvedValue({ data: [{ id: 'cus_1' }] }) },
      prices: { retrieve: jest.fn().mockResolvedValue({ id: 'price_dose', unit_amount: 9500, currency: 'eur' }) },
      invoices: {
        create: jest.fn().mockResolvedValue({ id: 'in_1' }),
        finalizeInvoice: jest.fn().mockResolvedValue({ id: 'in_1', hosted_invoice_url: 'https://pay/in_1', amount_due: 13500, currency: 'eur', status: 'open' }),
      },
      invoiceItems: { create: jest.fn().mockResolvedValue({}) },
    };
  }
  const run = async (fee: number) => {
    const { billing } = build();
    const stripe = supplyStripe();
    (billing as any).stripe = stripe;
    await billing.createSupplyInvoice(PATIENT, { id: 'o-1', patientId: 'p-1', description: 'Wegovy 0.25 mg' }, ['price_dose'], fee);
    return stripe;
  };

  it('adds the fee as its own line next to the medicine', async () => {
    const stripe = await run(4000);
    expect(stripe.invoiceItems.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 9500 }), expect.anything());
    expect(stripe.invoiceItems.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 4000, description: 'Prescription fee' }), { idempotencyKey: 'supply-fee-o-1' });
  });

  it('adds no fee line when there is none to charge', async () => {
    const stripe = await run(0);
    expect(stripe.invoiceItems.create).toHaveBeenCalledTimes(1);
  });
});
