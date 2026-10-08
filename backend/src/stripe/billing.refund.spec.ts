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
