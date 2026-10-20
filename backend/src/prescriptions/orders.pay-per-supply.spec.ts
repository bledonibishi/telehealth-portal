import { OrdersService } from './orders.service';

const RX = { id: 'rx-1', patientId: 'p-1', status: 'ACTIVE', validUntil: new Date(Date.now() + 86_400_000), refillsAllowed: 5 };
const PATIENT = { id: 'p-1', email: 'p@example.com', firstName: 'Emma', stripeCustomerId: 'cus_1', stripeSubscriptionId: null };

function build(opts: { paysPerSupply?: boolean; paymentFailedAt?: Date | null } = {}) {
  const prisma: any = {
    order: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'o-new', ...data })),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'o-new' }),
    },
    prescription: { findUnique: jest.fn().mockResolvedValue({ ...RX, orders: [{ status: 'DELIVERED', sequence: 1 }], patient: { subscriptionEndedAt: null, paysPerSupply: !!opts.paysPerSupply, paymentFailedAt: opts.paymentFailedAt ?? null } }) },
    refillRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    patient: { update: jest.fn().mockResolvedValue({}) },
  };
  const partner = { trySend: jest.fn(), markCancelled: jest.fn(), flushCancellations: jest.fn() };
  const billing = { createReturnSubscription: jest.fn().mockResolvedValue({ subscriptionId: 'sub_1', clientSecret: 'pi_secret', amountDueCents: 2250, totalCents: 2250, currency: 'eur' }), createSupplyInvoice: jest.fn().mockResolvedValue({ invoiceId: 'in_1', url: 'https://pay/in_1', amountCents: 12900, currency: 'eur', paid: false }), voidSupplyInvoice: jest.fn() };
  const dosePricing = { priceIdsFor: jest.fn().mockReturnValue(['price_dose']) };
  const email = { sendSupplyPaymentEmail: jest.fn().mockResolvedValue(undefined) };
  const notifier = { toPatient: jest.fn().mockResolvedValue(undefined), resolve: jest.fn().mockResolvedValue(undefined) };
  const service = new OrdersService(prisma, { log: jest.fn() } as any, { assertRepeatAllowed: jest.fn() } as any, partner as any, { get: () => undefined } as any, email as any, billing as any, notifier as any, dosePricing as any);
  return { prisma, partner, billing, dosePricing, email, notifier, service };
}

const WAITING = {
  id: 'o-new', status: 'AWAITING_PAYMENT', paymentInvoiceId: null, patientId: 'p-1', patient: PATIENT,
  prescription: { consultation: { kind: 'GLP1' }, items: [{ product: { category: 'GLP1', brandName: 'Wegovy', name: 'Semaglutide' }, strength: { label: '0.25 mg', titrationStep: 1, stripePriceId: 'price_dose' } }] },
};

describe('a repeat supply for a patient who pays per supply', () => {
  it('is held until it is paid: made awaiting payment, and not sent to the pharmacy', async () => {
    const { service, prisma, partner } = build({ paysPerSupply: true });
    prisma.order.findUnique.mockResolvedValue(WAITING);
    await service.createRepeat('doc-1', 'rx-1');
    expect(prisma.order.create.mock.calls[0][0].data.status).toBe('AWAITING_PAYMENT');
    expect(partner.trySend).not.toHaveBeenCalled();
  });

  it('asks for payment at once: an invoice for the dose, then a notification and an email with the link', async () => {
    const { service, prisma, billing, notifier, email } = build({ paysPerSupply: true });
    prisma.order.findUnique.mockResolvedValue(WAITING);
    await service.createRepeat('doc-1', 'rx-1');
    expect(billing.createSupplyInvoice).toHaveBeenCalledWith(PATIENT, { id: 'o-new', patientId: 'p-1', description: 'Wegovy 0.25 mg' }, ['price_dose'], 0);
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'o-new' }, data: { paymentInvoiceId: 'in_1', paymentUrl: 'https://pay/in_1', paymentAmountCents: 12900, paymentCurrency: 'eur' } });
    expect(notifier.toPatient).toHaveBeenCalledWith('p-1', expect.objectContaining({ kind: 'ORDER_PAYMENT_DUE' }));
    expect(email.sendSupplyPaymentEmail).toHaveBeenCalledWith('p@example.com', 'Emma', { amount: 12900, currency: 'eur', payUrl: 'https://pay/in_1' });
  });

  it('adds the doctor\'s fee for a patient whose first payment carried it, and not for one from before the fee', async () => {
    const withFee = build({ paysPerSupply: true });
    withFee.prisma.order.findUnique.mockResolvedValue({ ...WAITING, patient: { ...PATIENT, prescriptionFeePaidCents: 4000 } });
    await withFee.service.requestPayment('o-new');
    expect(withFee.billing.createSupplyInvoice).toHaveBeenCalledWith(expect.anything(), expect.anything(), ['price_dose'], 4000);
  });

  it('does not ask twice: an order that has its invoice is left alone', async () => {
    const { service, prisma, billing } = build({ paysPerSupply: true });
    prisma.order.findUnique.mockResolvedValue({ ...WAITING, paymentInvoiceId: 'in_old' });
    expect(await service.requestPayment('o-new')).toBe(false);
    expect(billing.createSupplyInvoice).not.toHaveBeenCalled();
  });

  it('says nothing when account credit covered the whole invoice (it is settled by itself)', async () => {
    const { service, prisma, billing, notifier, email } = build({ paysPerSupply: true });
    prisma.order.findUnique.mockResolvedValue(WAITING);
    billing.createSupplyInvoice.mockResolvedValue({ invoiceId: 'in_1', url: 'https://pay/in_1', amountCents: 0, currency: 'eur', paid: true });
    await service.requestPayment('o-new');
    expect(notifier.toPatient).not.toHaveBeenCalled();
    expect(email.sendSupplyPaymentEmail).not.toHaveBeenCalled();
  });

  it('keeps the order waiting, and never throws, when the invoice could not be made (the sweep retries)', async () => {
    const { service, prisma, billing } = build({ paysPerSupply: true });
    prisma.order.findUnique.mockResolvedValue(WAITING);
    billing.createSupplyInvoice.mockRejectedValue(new Error('Stripe is down'));
    await expect(service.requestPayment('o-new')).resolves.toBe(false);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('cannot be requested again while one is already waiting for payment', async () => {
    const { service, prisma } = build({ paysPerSupply: true });
    prisma.prescription.findUnique.mockResolvedValue({ ...RX, orders: [{ status: 'AWAITING_PAYMENT', sequence: 2 }], patient: { subscriptionEndedAt: null, paysPerSupply: true } });
    await expect(service.createRepeat('doc-1', 'rx-1')).rejects.toThrow(/already an order waiting/);
  });

  it('is unchanged for a subscriber: pending, and sent to the pharmacy straight away', async () => {
    const { service, partner, prisma } = build({ paysPerSupply: false });
    await service.createRepeat('doc-1', 'rx-1');
    expect(prisma.order.create.mock.calls[0][0].data.status).toBeUndefined();
    expect(partner.trySend).toHaveBeenCalledWith('o-new');
  });
});

describe('paying for a supply', () => {
  it('releases the order to the pharmacy once its invoice is paid', async () => {
    const { service, prisma, partner } = build();
    prisma.order.findUnique.mockResolvedValue({ id: 'o-1', patientId: 'p-1' });
    expect(await service.markPaid('in_1')).toBe(true);
    expect(prisma.order.updateMany).toHaveBeenCalledWith({ where: { id: 'o-1', status: 'AWAITING_PAYMENT' }, data: { status: 'PENDING', paidAt: expect.any(Date) } });
    expect(partner.trySend).toHaveBeenCalledWith('o-1');
  });

  it('is safe to repeat: a second payment event finds nothing to release', async () => {
    const { service, prisma, partner } = build();
    prisma.order.findUnique.mockResolvedValue({ id: 'o-1', patientId: 'p-1' });
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.markPaid('in_1')).toBe(false);
    expect(partner.trySend).not.toHaveBeenCalled();
  });

  it('ignores an invoice that belongs to no order', async () => {
    const { service, prisma, partner } = build();
    prisma.order.findUnique.mockResolvedValue(null);
    expect(await service.markPaid('in_x')).toBe(false);
    expect(partner.trySend).not.toHaveBeenCalled();
  });
});

describe('cancelling an unpaid supply', () => {
  it('withdraws its invoice so it can not be paid later, and cancels it from awaiting payment', async () => {
    const { service, prisma, billing } = build();
    prisma.order.findUnique.mockResolvedValue({ id: 'o-1', patientId: 'p-1', sequence: 2, status: 'AWAITING_PAYMENT', paymentInvoiceId: 'in_1', patient: PATIENT, prescription: { consultation: null } });
    await service.cancel('admin-1', 'o-1', 'Patient asked to stop');
    expect(billing.voidSupplyInvoice).toHaveBeenCalledWith('in_1');
    expect(prisma.order.updateMany).toHaveBeenCalledWith({ where: { id: 'o-1', status: 'AWAITING_PAYMENT' }, data: expect.objectContaining({ status: 'CANCELLED' }) });
  });
});

describe('the payment sweep', () => {
  it('asks again for orders whose invoice could not be made, and reminds once after a few days', async () => {
    const { service, prisma, email } = build();
    prisma.order.findMany
      .mockResolvedValueOnce([]) // prescription ran out
      .mockResolvedValueOnce([]) // not yet asked
      .mockResolvedValueOnce([{ id: 'o-1', paymentUrl: 'https://pay/in_1', paymentAmountCents: 12900, paymentCurrency: 'eur', patient: PATIENT }]); // waiting long enough
    expect(await service.sweepPayments()).toEqual({ requested: 0, reminded: 1 });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({ where: { id: 'o-1', paymentReminderAt: null, status: 'AWAITING_PAYMENT' }, data: { paymentReminderAt: expect.any(Date) } });
    expect(email.sendSupplyPaymentEmail).toHaveBeenCalledWith('p@example.com', 'Emma', expect.objectContaining({ reminder: true, payUrl: 'https://pay/in_1' }));
  });

  it('sends no second reminder when another sweep already claimed it', async () => {
    const { service, prisma, email } = build();
    prisma.order.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'o-1', paymentUrl: 'u', paymentAmountCents: 1, paymentCurrency: 'eur', patient: PATIENT }]);
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    expect((await service.sweepPayments()).reminded).toBe(0);
    expect(email.sendSupplyPaymentEmail).not.toHaveBeenCalled();
  });
});

describe('a patient whose payment failed', () => {
  it('gets no further supply ordered until a payment goes through', async () => {
    const { service, prisma } = build({ paymentFailedAt: new Date() });
    await expect(service.createRepeat('doc-1', 'rx-1')).rejects.toThrow(/last payment failed/);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});


describe('a refunded patient who comes back and subscribes', () => {
  it('starts the subscription for the medicine of their waiting order, with no fee', async () => {
    const { service, prisma, billing } = build();
    prisma.order.findFirst = jest.fn().mockResolvedValue({ ...WAITING, reorder: true });
    const result = await service.startReturnSubscription('p-1');
    expect(billing.createReturnSubscription).toHaveBeenCalledWith(PATIENT, { id: 'o-new', patientId: 'p-1' }, ['price_dose']);
    expect(result).toEqual({ clientSecret: 'pi_secret', amountDueCents: 2250, totalCents: 2250, currency: 'eur' });
  });

  it('has nothing to start when no come-back order is waiting', async () => {
    const { service, prisma, billing } = build();
    prisma.order.findFirst = jest.fn().mockResolvedValue(null);
    expect(await service.startReturnSubscription('p-1')).toBeNull();
    expect(billing.createReturnSubscription).not.toHaveBeenCalled();
  });

  it('releases the order, withdraws the unused invoice and reopens the account on the subscription, once', async () => {
    const { service, prisma, billing, partner } = build();
    prisma.order.findUnique.mockResolvedValue({ id: 'o-new', patientId: 'p-1', paymentInvoiceId: 'in_supply' });
    expect(await service.markReturnSubscribed('o-new', 'sub_1', 'cus_1')).toBe(true);
    expect(billing.voidSupplyInvoice).toHaveBeenCalledWith('in_supply');
    expect(prisma.patient.update).toHaveBeenCalledWith({ where: { id: 'p-1' }, data: expect.objectContaining({ accessClosedAt: null, subscriptionEndedAt: null, paysPerSupply: false, stripeSubscriptionId: 'sub_1' }) });
    expect(partner.trySend).toHaveBeenCalledWith('o-new');
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.markReturnSubscribed('o-new', 'sub_1', 'cus_1')).toBe(false);
  });
});
