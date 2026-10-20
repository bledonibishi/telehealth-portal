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

describe('a subscription bought at the subscriber price keeps its 10% when the dose changes', () => {
  // The patient pays 90% of 199.00 (179.10) on an inline price of product prod_1.
  function discountedStripe(newFull: number, amountPaid = 17910) {
    return {
      subscriptions: {
        retrieve: jest.fn().mockResolvedValue({
          id: 'sub_1', status: 'active', metadata: { billing: 'SUBSCRIPTION' },
          items: { data: [{ id: 'si_1', price: { id: 'price_anon', product: 'prod_1', unit_amount: 17910, currency: 'eur' } }] },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      prices: { retrieve: jest.fn().mockResolvedValue({ id: 'price_new', product: 'prod_2', unit_amount: newFull, currency: 'eur', recurring: { interval: 'month' } }) },
      invoices: { list: jest.fn().mockResolvedValue({ data: [{ id: 'in_1', amount_paid: amountPaid, currency: 'eur', payment_intent: 'pi_1' }] }) },
      refunds: { create: jest.fn().mockResolvedValue({ id: 're_1' }) },
    };
  }

  it('bills the cheaper dose at 90% of its price, not its full price, and refunds the difference between what is paid', async () => {
    const stripe = discountedStripe(14900); // 90% = 134.10
    await billingWith(stripe).moveToPrescribedPrice(PATIENT, 'price_new');
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_1', price_data: { currency: 'eur', product: 'prod_2', unit_amount: 13410, recurring: { interval: 'month' } } }],
      proration_behavior: 'none',
    });
    expect(stripe.refunds.create.mock.calls[0][0].amount).toBe(4500); // 179.10 - 134.10
  });

  it('compares the discounted amounts: a dearer dose is still left for the patient to agree to', async () => {
    const stripe = discountedStripe(24900); // 90% = 224.10, more than 179.10
    const note = await billingWith(stripe).moveToPrescribedPrice(PATIENT, 'price_new', 'Wegovy 2.4 mg');
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(note).toMatch(/costs more/);
  });

  it('changePrice moves a subscriber to the new dose at their price too', async () => {
    const stripe = discountedStripe(14900);
    await billingWith(stripe).changePrice(PATIENT, 'price_new');
    expect(stripe.subscriptions.update.mock.calls[0][1].items[0].price_data.unit_amount).toBe(13410);
  });

  it('does nothing when the subscription already bills this dose at that price', async () => {
    const stripe = discountedStripe(19900); // 90% = 179.10, what they pay now, on prod_2 -> differs by product
    stripe.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_1', status: 'active', metadata: { billing: 'SUBSCRIPTION' },
      items: { data: [{ id: 'si_1', price: { id: 'price_anon', product: 'prod_2', unit_amount: 17910, currency: 'eur' } }] },
    });
    const note = await billingWith(stripe).changePrice(PATIENT, 'price_new');
    expect(note).toBe('Plan unchanged');
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });
});

describe('a subscription that also bills the prescription fee', () => {
  // Two lines: the medicine at the subscriber price, and the monthly fee under its own product.
  const feeItem = { id: 'si_fee', quantity: 1, price: { id: 'price_fee', product: { id: 'prod_fee', name: 'Prescription fee' }, unit_amount: 4000, currency: 'eur' } };
  const medicine = { id: 'si_1', quantity: 1, price: { id: 'price_anon', product: { id: 'prod_1', name: 'Wegovy' }, unit_amount: 17910, currency: 'eur' } };
  function stripeWithFee(newFull: number) {
    return {
      subscriptions: {
        retrieve: jest.fn().mockResolvedValue({ id: 'sub_1', status: 'active', metadata: { billing: 'SUBSCRIPTION' }, items: { data: [medicine, feeItem] } }),
        update: jest.fn().mockResolvedValue({}),
      },
      prices: { retrieve: jest.fn().mockResolvedValue({ id: 'price_new', product: 'prod_2', unit_amount: newFull, currency: 'eur', recurring: { interval: 'month' } }) },
      invoices: { list: jest.fn().mockResolvedValue({ data: [{ id: 'in_1', amount_paid: 21910, currency: 'eur', payment_intent: 'pi_1', lines: { data: [{ description: 'Prescription fee', amount: 4000 }] } }] }) },
      refunds: { create: jest.fn().mockResolvedValue({ id: 're_1' }) },
    };
  }

  it('moves only the medicine to the new dose, and leaves the fee line as it is', async () => {
    const stripe = stripeWithFee(14900);
    await billingWith(stripe).changePrice(PATIENT, 'price_new');
    const items = stripe.subscriptions.update.mock.calls[0][1].items;
    expect(items).toEqual([{ id: 'si_1', price_data: { currency: 'eur', product: 'prod_2', unit_amount: 13410, recurring: { interval: 'month' } } }]);
    expect(items.some((i: any) => i.id === 'si_fee')).toBe(false); // never touched, never deleted
  });

  it('shares the refund for a cheaper dose over the medicine alone, not over the fee', async () => {
    const stripe = stripeWithFee(14900); // 179.10 -> 134.10, so 45.00 less; the fee (40.00) is not part of what was paid for the dose
    await billingWith(stripe).moveToPrescribedPrice(PATIENT, 'price_new');
    expect(stripe.refunds.create.mock.calls[0][0].amount).toBe(4500);
  });
});
