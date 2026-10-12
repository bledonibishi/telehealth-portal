import { BillingService } from './billing.service';

const PATIENT = { email: 'p@example.com', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' };

function stripeWith({ oldAmount, newAmount, amountPaid, newCurrency = 'eur' }: { oldAmount: number; newAmount: number; amountPaid: number; newCurrency?: string }) {
  return {
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue({ id: 'sub_1', status: 'active', items: { data: [{ id: 'si_1', price: { id: 'price_old', unit_amount: oldAmount, currency: 'eur' } }] } }),
      update: jest.fn().mockResolvedValue({}),
    },
    prices: { retrieve: jest.fn().mockResolvedValue({ id: 'price_new', unit_amount: newAmount, currency: newCurrency }) },
    invoices: { list: jest.fn().mockResolvedValue({ data: [{ id: 'in_1', amount_paid: amountPaid, currency: 'eur', payment_intent: 'pi_1' }] }) },
    refunds: { create: jest.fn().mockResolvedValue({ id: 're_1' }) },
  };
}

function billingWith(stripe: any) {
  const billing = new BillingService({ get: () => 'sk_test' } as any);
  (billing as any).stripe = stripe;
  return billing;
}

describe('BillingService.moveToPrescribedPrice', () => {
  it('moves to the cheaper dose from next month and refunds the difference on what was paid', async () => {
    const stripe = stripeWith({ oldAmount: 19900, newAmount: 14900, amountPaid: 19900 });
    const note = await billingWith(stripe).moveToPrescribedPrice(PATIENT, 'price_new');
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { items: [{ id: 'si_1', price: 'price_new' }], proration_behavior: 'none' });
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_1', amount: 5000 }),
      { idempotencyKey: 'dose-price-refund-in_1-price_new' },
    );
    expect(note).toMatch(/refunded 50\.00 EUR for this month/);
  });

  it('shares a checkout discount fairly: refunds the same share of what was actually paid', async () => {
    const stripe = stripeWith({ oldAmount: 20000, newAmount: 15000, amountPaid: 18000 }); // 10% off at checkout
    await billingWith(stripe).moveToPrescribedPrice(PATIENT, 'price_new');
    expect(stripe.refunds.create.mock.calls[0][0].amount).toBe(4500);
  });

  it('never moves the patient onto a dearer plan without their agreement', async () => {
    const stripe = stripeWith({ oldAmount: 14900, newAmount: 19900, amountPaid: 14900 });
    const note = await billingWith(stripe).moveToPrescribedPrice(PATIENT, 'price_new', 'Wegovy 1.7 mg');
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(note).toMatch(/Billing unchanged: Wegovy 1\.7 mg costs more/);
  });

  it('leaves billing alone when the prices can’t be compared', async () => {
    const stripe = stripeWith({ oldAmount: 19900, newAmount: 14900, amountPaid: 19900, newCurrency: 'gbp' });
    const note = await billingWith(stripe).moveToPrescribedPrice(PATIENT, 'price_new');
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(note).toMatch(/can’t be compared/);
  });

  it('moves without a refund when the new dose costs the same', async () => {
    const stripe = stripeWith({ oldAmount: 14900, newAmount: 14900, amountPaid: 14900 });
    const note = await billingWith(stripe).moveToPrescribedPrice(PATIENT, 'price_new');
    expect(stripe.subscriptions.update).toHaveBeenCalled();
    expect(stripe.invoices.list).not.toHaveBeenCalled();
    expect(note).toBe('Billing moved to price_new from the next billing cycle');
  });

  it('does nothing when the prescribed dose is the one ordered', async () => {
    const stripe = stripeWith({ oldAmount: 14900, newAmount: 14900, amountPaid: 14900 });
    await billingWith(stripe).moveToPrescribedPrice(PATIENT, 'price_old');
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });
});

describe('BillingService multi-line plans', () => {
  function multi(existing: any[], prices: Record<string, number>, amountPaid = 6500) {
    return {
      subscriptions: {
        retrieve: jest.fn().mockResolvedValue({ id: 'sub_1', status: 'active', items: { data: existing } }),
        update: jest.fn().mockResolvedValue({}),
      },
      prices: { retrieve: jest.fn((id: string) => Promise.resolve({ id, unit_amount: prices[id], currency: 'eur' })) },
      invoices: { list: jest.fn().mockResolvedValue({ data: [{ id: 'in_1', amount_paid: amountPaid, currency: 'eur', payment_intent: 'pi_1' }] }) },
      refunds: { create: jest.fn().mockResolvedValue({ id: 're_1' }) },
    };
  }
  const item = (id: string, price: string, unit_amount: number) => ({ id, price: { id: price, unit_amount, currency: 'eur' } });

  it('drops the progesterone line when the prescription has none, and refunds the difference', async () => {
    const stripe = multi([item('si_e', 'price_evorel', 1500), item('si_p', 'price_utro', 4000)], { price_evorel: 1500 }, 5500);
    const note = await billingWith(stripe).moveToPrescribedPrice(PATIENT, ['price_evorel']);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { items: [{ id: 'si_p', deleted: true }], proration_behavior: 'none' });
    expect(stripe.refunds.create.mock.calls[0][0].amount).toBe(4000);
    expect(note).toMatch(/refunded 40\.00 EUR/);
  });

  it('swaps a dose in place and keeps the line that already matches', async () => {
    const stripe = multi([item('si_e', 'price_old', 2600), item('si_p', 'price_utro', 4000)], { price_new: 1700, price_utro: 4000 });
    await billingWith(stripe).moveToPrescribedPrice(PATIENT, ['price_new', 'price_utro']);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { items: [{ id: 'si_e', price: 'price_new' }], proration_behavior: 'none' });
  });

  it('refuses a dearer total, such as progesterone newly added by the doctor', async () => {
    const stripe = multi([item('si_e', 'price_evorel', 1500)], { price_evorel: 1500, price_utro: 4000 });
    const note = await billingWith(stripe).moveToPrescribedPrice(PATIENT, ['price_evorel', 'price_utro'], 'Evorel + Utrogestan');
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(note).toMatch(/costs more than the plan the patient paid for/);
  });

  it('changePrice adds a missing line', async () => {
    const stripe = multi([item('si_e', 'price_evorel', 1500)], {});
    await billingWith(stripe).changePrice(PATIENT, ['price_evorel', 'price_utro']);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { items: [{ price: 'price_utro' }], proration_behavior: 'none' });
  });
});

describe('BillingService.refundLatestPayment', () => {
  const stripeFor = (status: string, invoice: object | null) => ({
    subscriptions: { retrieve: jest.fn().mockResolvedValue({ id: 'sub_1', status, items: { data: [] } }), update: jest.fn() },
    invoices: { list: jest.fn().mockResolvedValue({ data: invoice ? [invoice] : [] }) },
    refunds: { create: jest.fn().mockResolvedValue({ id: 're_9' }) },
  });

  it('refunds the latest paid invoice and leaves the subscription running', async () => {
    const stripe = stripeFor('active', { id: 'in_1', amount_paid: 6500, payment_intent: 'pi_1' });
    const note = await billingWith(stripe).refundLatestPayment(PATIENT);
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, { idempotencyKey: 'decline-refund-in_1' });
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(note).toMatch(/Refunded the latest payment \(re_9\)/);
  });

  it('says so when there is nothing to refund, and never throws', async () => {
    expect(await billingWith(stripeFor('active', null)).refundLatestPayment(PATIENT)).toMatch(/Nothing to refund/);
    const broken = stripeFor('active', { id: 'in_1', amount_paid: 100, payment_intent: 'pi_1' });
    broken.refunds.create.mockRejectedValue(new Error('card network down'));
    expect(await billingWith(broken).refundLatestPayment(PATIENT)).toMatch(/Billing update failed/);
  });
});
