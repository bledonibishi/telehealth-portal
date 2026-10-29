import { NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ShopService, mismatch } from './shop.service';
import type { ShopPaymentAdapter } from './payment-provider';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

function adapter(key: string, configured = true): jest.Mocked<ShopPaymentAdapter> {
  return {
    key: key as any,
    kind: key === 'COD' || key === 'BANK_TRANSFER' ? 'OFFLINE' : 'CARD',
    label: key,
    description: key,
    isConfigured: jest.fn().mockReturnValue(configured),
    start: jest.fn().mockResolvedValue({ providerOrderId: `${key}-order`, redirectUrl: `https://pay.test/${key}` }),
    status: jest.fn().mockResolvedValue({ status: 'PENDING' }),
    refund: jest.fn().mockResolvedValue('refund-1'),
    ...(key === 'BANK_TRANSFER' && { details: () => ({ iban: 'XK051212012345678906', accountName: 'Omo Pharmacy', bankName: null }) }),
  } as jest.Mocked<ShopPaymentAdapter>;
}

const ORDER = {
  id: 'o1', reference: 'OMO-ABC123', accessToken: sha256('secret'), email: 'arta@example.com', firstName: 'Arta', lastName: 'Krasniqi', phone: null,
  shippingAddress: { line1: 'Rr. 1', city: 'Prishtinë', postalCode: '10000', country: 'XK' }, status: 'AWAITING_PAYMENT', provider: 'RAIACCEPT',
  subtotalCents: 2990, shippingCents: 0, totalCents: 2990, currency: 'eur', refundedCents: 0, expiresAt: new Date(Date.now() - 1000),
  items: [{ productId: 'p1', name: 'Whey protein 1 kg', unitPriceCents: 2990, quantity: 1 }],
  payments: [] as any[],
};
const PAYMENT = { id: 'pay1', orderId: 'o1', provider: 'RAIACCEPT', attempt: 1, status: 'PENDING', providerOrderId: 'R-1', amountCents: 2990, currency: 'eur', failureMessage: null };

function setup(opts: { adapters?: jest.Mocked<ShopPaymentAdapter>[]; env?: Record<string, string> } = {}) {
  const order = { ...ORDER, payments: [{ ...PAYMENT }] };
  const prisma: any = {
    shopProduct: {
      findMany: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Whey protein 1 kg', priceCents: 2990, currency: 'eur', vatRate: 18, stock: 5, maxPerOrder: 5, active: true }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    shopOrder: {
      // A lookup by reference alone (select: id) is the check for a free order number: none is taken.
      findUnique: jest.fn().mockImplementation((args: any) => Promise.resolve(args?.select ? null : order)),
      findUniqueOrThrow: jest.fn().mockResolvedValue(order),
      findMany: jest.fn().mockResolvedValue([order]),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...order, ...data, items: order.items, id: 'o-new', payments: [] })),
      update: jest.fn().mockResolvedValue(order),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    shopOrderItem: { findMany: jest.fn().mockResolvedValue(order.items) },
    shopPayment: {
      create: jest.fn().mockResolvedValue({ ...PAYMENT, id: 'pay-new' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ ...PAYMENT }),
    },
    fiscalReceipt: { create: jest.fn().mockResolvedValue({}) },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const email = { sendShopOrderEmail: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const env: Record<string, string> = { WEBFLOW_SITE_URL: 'https://shop.test', API_PUBLIC_URL: 'https://api.test', ...opts.env };
  const config = { get: (key: string) => env[key] };
  const adapters = opts.adapters ?? [adapter('RAIACCEPT'), adapter('STRIPE'), adapter('DEV')];
  const service = new ShopService(prisma, config as any, email as any, audit as any, adapters);
  return { service, prisma, email, adapters, order };
}

const PAID = { status: 'SUCCEEDED' as const, amountCents: 2990, currency: 'eur', merchantReference: 'OMO-ABC123-1', transactionId: 'TX-1', cardSummary: 'VISA ···· 0011' };

describe('ShopService payments', () => {
  it('marks the order paid, owes a fiscal receipt and emails the buyer when the provider confirms the amount', async () => {
    const { service, prisma, email } = setup();
    await service.apply({ ...PAYMENT } as any, PAID);
    expect(prisma.shopPayment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pay1', status: 'PENDING' }, data: expect.objectContaining({ status: 'SUCCEEDED', providerTransactionId: 'TX-1' }) }));
    expect(prisma.shopOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }));
    expect(prisma.fiscalReceipt.create).toHaveBeenCalledWith({ data: { orderId: 'o1', kind: 'SALE', amountCents: 2990, currency: 'eur' } });
    expect(email.sendShopOrderEmail).toHaveBeenCalledWith('arta@example.com', 'Arta', expect.objectContaining({ kind: 'PAID', reference: 'OMO-ABC123' }));
  });

  it('never marks paid when the provider reports another amount, currency or reference', async () => {
    for (const wrong of [{ amountCents: 100 }, { currency: 'usd' }, { merchantReference: 'OMO-OTHER-1' }]) {
      const { service, prisma, email } = setup();
      await service.apply({ ...PAYMENT } as any, { ...PAID, ...wrong });
      expect(prisma.shopPayment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', failureCode: 'MISMATCH' }) }));
      expect(prisma.shopOrder.update).not.toHaveBeenCalled();
      expect(email.sendShopOrderEmail).not.toHaveBeenCalled();
    }
  });

  it('keeps a try open, not failed, when it is reported paid before its transaction can be read', async () => {
    const { service, prisma, email } = setup();
    await service.apply({ ...PAYMENT } as any, { ...PAID, transactionId: undefined });
    expect(prisma.shopPayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay1', status: 'PENDING' },
      data: expect.objectContaining({ failureCode: 'PAID_UNCONFIRMED' }),
    });
    expect(prisma.shopPayment.updateMany.mock.calls[0][0].data.status).toBeUndefined();
    expect(prisma.shopOrder.update).not.toHaveBeenCalled();
    expect(email.sendShopOrderEmail).not.toHaveBeenCalled();
  });

  it('records a payment once, however many times it is reported', async () => {
    const { service, prisma, email } = setup();
    prisma.shopPayment.updateMany.mockResolvedValue({ count: 0 });
    await service.apply({ ...PAYMENT } as any, PAID);
    expect(prisma.shopOrder.update).not.toHaveBeenCalled();
    expect(prisma.fiscalReceipt.create).not.toHaveBeenCalled();
    expect(email.sendShopOrderEmail).not.toHaveBeenCalled();
  });

  it('takes the stock again when an order is paid after its hold lapsed', async () => {
    const { service, prisma, order } = setup();
    prisma.shopOrder.findUniqueOrThrow.mockResolvedValue({ ...order, status: 'CANCELLED' });
    await service.apply({ ...PAYMENT } as any, PAID);
    expect(prisma.shopProduct.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { stock: { decrement: 1 } } });
    expect(prisma.shopOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }));
  });

  it('keeps a second paid try on an order already paid, for staff to refund, without a second sale', async () => {
    const { service, prisma, order, email } = setup();
    prisma.shopOrder.findUniqueOrThrow.mockResolvedValue({ ...order, status: 'PAID' });
    await service.apply({ ...PAYMENT } as any, PAID);
    expect(prisma.fiscalReceipt.create).not.toHaveBeenCalled();
    expect(email.sendShopOrderEmail).not.toHaveBeenCalled();
  });

  it('a notification only makes it ask the provider; its body is never trusted', async () => {
    const { service, adapters, prisma } = setup();
    adapters[0].status.mockResolvedValue({ status: 'FAILED', failureCode: '2004', failureMessage: 'declined' });
    await service.onProviderNotice('RAIACCEPT' as any, 'R-1');
    expect(adapters[0].status).toHaveBeenCalledWith('R-1');
    expect(prisma.shopPayment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', failureCode: '2004' }) }));
    expect(prisma.shopOrder.update).not.toHaveBeenCalled();
  });

  it('ignores notifications about orders that are not ours', async () => {
    const { service, prisma, adapters } = setup();
    prisma.shopPayment.findUnique.mockResolvedValue(null);
    expect(await service.onProviderNotice('RAIACCEPT' as any, 'unknown')).toEqual({ handled: false });
    expect(adapters[0].status).not.toHaveBeenCalled();
  });
});

describe('ShopService sweep', () => {
  it('asks the provider before letting go of a lapsed order’s stock', async () => {
    const { service, adapters, prisma } = setup();
    await service.sweep();
    expect(adapters[0].status).toHaveBeenCalledWith('R-1');
    expect(prisma.shopOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'o1', status: { in: ['AWAITING_PAYMENT'] }, paidAt: null }, data: expect.objectContaining({ status: 'CANCELLED' }) }));
    expect(prisma.shopProduct.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { stock: { increment: 1 } } });
    // The open try stays open, so a buyer who finishes paying late is still recorded.
    expect(prisma.shopPayment.updateMany).not.toHaveBeenCalled();
  });

  it('keeps holding the stock of a lapsed order the provider reports paid but can’t confirm yet', async () => {
    const { service, adapters, prisma } = setup();
    adapters[0].status.mockResolvedValue({ ...PAID, transactionId: undefined });
    const result = await service.sweep();
    expect(result.released).toBe(0);
    expect(prisma.shopOrder.updateMany).not.toHaveBeenCalled();
  });

  it('keeps holding the stock when the provider can’t be asked', async () => {
    const { service, adapters, prisma } = setup();
    adapters[0].status.mockRejectedValue(new Error('timeout'));
    const result = await service.sweep();
    expect(result.released).toBe(0);
    expect(prisma.shopOrder.updateMany).not.toHaveBeenCalled();
  });
});

describe('ShopService ordering', () => {
  const buyer = { email: 'Arta@Example.com', firstName: 'Arta', lastName: 'Krasniqi', address: { line1: 'Rr. 1', city: 'Prishtinë', postalCode: '10000', country: 'xk' } };

  it('holds the stock, prices on the server and opens the chosen provider’s page', async () => {
    const { service, prisma, adapters } = setup();
    const result = await service.createOrder({ ...buyer, provider: 'RAIACCEPT', items: [{ productId: 'p1', quantity: 1 }], expectedTotalCents: 2990 });
    expect(prisma.shopProduct.updateMany).toHaveBeenCalledWith({ where: { id: 'p1', active: true, stock: { gte: 1 } }, data: { stock: { decrement: 1 } } });
    expect(prisma.shopOrder.create.mock.calls[0][0].data).toMatchObject({ email: 'arta@example.com', totalCents: 2990, provider: 'RAIACCEPT' });
    expect(adapters[0].start).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 2990, urls: expect.objectContaining({ notify: 'https://api.test/api/shop/payments/raiaccept/notify' }) }));
    expect(result.redirectUrl).toBe('https://pay.test/RAIACCEPT');
    // The token goes back to the buyer once; only its hash is kept.
    expect(prisma.shopOrder.create.mock.calls[0][0].data.accessToken).toBe(sha256(result.token));
  });

  it('shows the new total instead of charging it when a price changed', async () => {
    const { service, prisma } = setup();
    await expect(service.createOrder({ ...buyer, provider: 'RAIACCEPT', items: [{ productId: 'p1', quantity: 1 }], expectedTotalCents: 1990 })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SHOP_PRICE_CHANGED' }) });
    expect(prisma.shopOrder.create).not.toHaveBeenCalled();
  });

  it('refuses an order when the stock ran out meanwhile', async () => {
    const { service, prisma } = setup();
    prisma.shopProduct.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.createOrder({ ...buyer, provider: 'RAIACCEPT', items: [{ productId: 'p1', quantity: 1 }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SHOP_OUT_OF_STOCK' }) });
  });

  it('gives the stock back when the payment page can’t be opened', async () => {
    const { service, adapters, prisma } = setup();
    adapters[0].start.mockRejectedValue(new Error('down'));
    await expect(service.createOrder({ ...buyer, provider: 'RAIACCEPT', items: [{ productId: 'p1', quantity: 1 }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PAYMENT_PROVIDER_UNAVAILABLE' }) });
    expect(prisma.shopOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }));
  });

  it('only offers the test payment while no real provider is set up', () => {
    expect(setup().service.checkoutOptions().paymentMethods.map((m) => m.key)).toEqual(['RAIACCEPT', 'STRIPE']);
    const onlyDev = setup({ adapters: [adapter('RAIACCEPT', false), adapter('STRIPE', false), adapter('DEV')] });
    expect(onlyDev.service.checkoutOptions().paymentMethods.map((m) => m.key)).toEqual(['DEV']);
  });

  it('offers only the providers SHOP_PAYMENT_PROVIDERS lists', () => {
    expect(setup({ env: { SHOP_PAYMENT_PROVIDERS: 'raiaccept' } }).service.checkoutOptions().paymentMethods.map((m) => m.key)).toEqual(['RAIACCEPT']);
    // Listed but not set up: only the test payment, never a provider that wasn't listed.
    const unset = setup({ env: { SHOP_PAYMENT_PROVIDERS: 'RAIACCEPT' }, adapters: [adapter('RAIACCEPT', false), adapter('STRIPE'), adapter('DEV')] });
    expect(unset.service.checkoutOptions().paymentMethods.map((m) => m.key)).toEqual(['DEV']);
  });

  it('refuses a provider that isn’t offered', async () => {
    const { service } = setup();
    await expect(service.createOrder({ ...buyer, provider: 'DEV', items: [{ productId: 'p1', quantity: 1 }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VALIDATION_FAILED' }) });
  });

  it('shows an order only with its token, and the same answer when the order doesn’t exist', async () => {
    const { service, prisma } = setup();
    await expect(service.orderStatus('OMO-ABC123', 'wrong')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.orderStatus('OMO-ABC123', undefined)).rejects.toBeInstanceOf(NotFoundException);
    prisma.shopOrder.findUnique.mockResolvedValue(null);
    await expect(service.orderStatus('OMO-NOPE', 'secret')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ShopService refunds', () => {
  it('refunds through the provider that was paid, owes a correcting receipt and puts the stock back when asked', async () => {
    const { service, prisma, adapters } = setup();
    prisma.shopOrder.findUnique.mockResolvedValue({ ...ORDER, status: 'PAID', refunds: [], payments: [{ ...PAYMENT, status: 'SUCCEEDED', providerTransactionId: 'TX-1' }] });
    prisma.shopRefund = { create: jest.fn().mockResolvedValue({ id: 'rf1' }) };
    await service.refund('o1', { restock: true, reason: 'Changed mind' }, 'staff-1');
    expect(adapters[0].refund).toHaveBeenCalledWith({ providerOrderId: 'R-1', providerTransactionId: 'TX-1', currency: 'eur' }, 2990);
    expect(prisma.fiscalReceipt.create).toHaveBeenCalledWith({ data: { orderId: 'o1', kind: 'REFUND', amountCents: 2990, currency: 'eur', refundId: 'rf1' } });
    expect(prisma.shopOrder.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { refundedCents: { increment: 2990 }, status: 'REFUNDED' } });
    expect(prisma.shopProduct.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { stock: { increment: 1 } } });
  });

  it('refunds one of two payments on an order paid twice, and leaves it paid', async () => {
    const { service, prisma, adapters } = setup();
    const second = { ...PAYMENT, id: 'pay2', attempt: 2, providerOrderId: 'R-2', status: 'SUCCEEDED', providerTransactionId: 'TX-2' };
    prisma.shopOrder.findUnique.mockResolvedValue({
      ...ORDER, status: 'PAID', refundedCents: 2990,
      refunds: [{ paymentId: 'pay1', amountCents: 2990 }],
      payments: [{ ...PAYMENT, status: 'SUCCEEDED', providerTransactionId: 'TX-1' }, second],
    });
    prisma.shopRefund = { create: jest.fn().mockResolvedValue({ id: 'rf2' }) };
    // The first payment is already given back: the refund goes to the one with money left.
    await service.refund('o1', {}, 'staff-1');
    expect(adapters[0].refund).toHaveBeenCalledWith({ providerOrderId: 'R-2', providerTransactionId: 'TX-2', currency: 'eur' }, 2990);
    // Everything taken (2 × 29.90) is now back, so the order counts as refunded.
    expect(prisma.shopOrder.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { refundedCents: { increment: 2990 }, status: 'REFUNDED' } });
  });

  it('keeps an order paid twice as paid, without restocking, when one duplicate is refunded', async () => {
    const { service, prisma } = setup();
    const second = { ...PAYMENT, id: 'pay2', attempt: 2, providerOrderId: 'R-2', status: 'SUCCEEDED', providerTransactionId: 'TX-2' };
    prisma.shopOrder.findUnique.mockResolvedValue({ ...ORDER, status: 'PAID', refunds: [], payments: [{ ...PAYMENT, status: 'SUCCEEDED', providerTransactionId: 'TX-1' }, second] });
    prisma.shopRefund = { create: jest.fn().mockResolvedValue({ id: 'rf1' }) };
    await service.refund('o1', { paymentId: 'pay2', restock: true }, 'staff-1');
    expect(prisma.shopOrder.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { refundedCents: { increment: 2990 } } });
    expect(prisma.shopProduct.update).not.toHaveBeenCalled();
  });

  it('refuses to give back more than was paid', async () => {
    const { service, prisma, adapters } = setup();
    prisma.shopOrder.findUnique.mockResolvedValue({ ...ORDER, status: 'PAID', refunds: [{ paymentId: 'pay1', amountCents: 2000 }], payments: [{ ...PAYMENT, status: 'SUCCEEDED', providerTransactionId: 'TX-1' }] });
    await expect(service.refund('o1', { amountCents: 1000 }, 'staff-1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VALIDATION_FAILED' }) });
    expect(adapters[0].refund).not.toHaveBeenCalled();
  });

  it('records nothing when the provider refuses the refund', async () => {
    const { service, prisma, adapters } = setup();
    prisma.shopOrder.findUnique.mockResolvedValue({ ...ORDER, status: 'PAID', refunds: [], payments: [{ ...PAYMENT, status: 'SUCCEEDED', providerTransactionId: 'TX-1' }] });
    adapters[0].refund.mockRejectedValue(new Error('2005'));
    await expect(service.refund('o1', {}, 'staff-1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PAYMENT_PROVIDER_UNAVAILABLE' }) });
    expect(prisma.fiscalReceipt.create).not.toHaveBeenCalled();
  });
});

describe('mismatch', () => {
  const expected = { amountCents: 2990, currency: 'eur', merchantReference: 'OMO-ABC123-1' };
  it('accepts a payment that matches, whatever the currency’s case, with or without the reference', () => {
    expect(mismatch(expected, { ...PAID, currency: 'EUR' })).toBeNull();
    expect(mismatch(expected, { ...PAID, merchantReference: undefined })).toBeNull();
  });
});

describe('ShopService paying on delivery and by bank transfer', () => {
  const buyer = { email: 'arta@example.com', firstName: 'Arta', lastName: 'Krasniqi', phone: '+383 44 123 456', address: { line1: 'Rr. 1', city: 'Prishtinë', postalCode: '10000', country: 'XK' } };
  const env = { SHOP_PAYMENT_PROVIDERS: 'RAIACCEPT,COD,BANK_TRANSFER' };
  const withOffline = () => setup({ env, adapters: [adapter('RAIACCEPT'), adapter('DEV'), adapter('COD'), adapter('BANK_TRANSFER')] });

  it('offers card first, then pay on delivery and transfer; the test card only stands in when no real card is set up', () => {
    expect(withOffline().service.checkoutOptions().paymentMethods.map((m) => m.key)).toEqual(['RAIACCEPT', 'COD', 'BANK_TRANSFER']);
    const noCard = setup({ env, adapters: [adapter('RAIACCEPT', false), adapter('DEV'), adapter('COD'), adapter('BANK_TRANSFER')] });
    expect(noCard.service.checkoutOptions().paymentMethods.map((m) => m.key)).toEqual(['DEV', 'COD', 'BANK_TRANSFER']);
  });

  it('confirms a pay-on-delivery order straight away and tells the buyer what to pay', async () => {
    const { service, prisma, email } = withOffline();
    const result = await service.createOrder({ ...buyer, provider: 'COD', items: [{ productId: 'p1', quantity: 1 }] });
    expect(result.kind).toBe('OFFLINE');
    expect(prisma.shopOrder.updateMany).toHaveBeenCalledWith({ where: { id: 'o-new', status: 'AWAITING_PAYMENT' }, data: { status: 'CONFIRMED' } });
    expect(email.sendShopOrderEmail).toHaveBeenCalledWith('arta@example.com', 'Arta', expect.objectContaining({ kind: 'CONFIRMED_COD' }));
  });

  it('needs a phone number for pay on delivery', async () => {
    const { service } = withOffline();
    await expect(service.createOrder({ ...buyer, phone: '', provider: 'COD', items: [{ productId: 'p1', quantity: 1 }] })).rejects.toMatchObject({ response: expect.objectContaining({ fields: { phone: 'Needed for pay on delivery' } }) });
  });

  it('refuses pay on delivery above SHOP_COD_MAX_CENTS', async () => {
    const { service, prisma } = setup({ env: { ...env, SHOP_COD_MAX_CENTS: '2000' }, adapters: [adapter('RAIACCEPT'), adapter('COD')] });
    await expect(service.createOrder({ ...buyer, provider: 'COD', items: [{ productId: 'p1', quantity: 1 }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VALIDATION_FAILED' }) });
    expect(prisma.shopOrder.create).not.toHaveBeenCalled();
  });

  it('holds a bank-transfer order for days, not minutes', async () => {
    const { service, prisma } = withOffline();
    await service.createOrder({ ...buyer, provider: 'BANK_TRANSFER', items: [{ productId: 'p1', quantity: 1 }] });
    const expiresAt: Date = prisma.shopOrder.create.mock.calls[0][0].data.expiresAt;
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(2.9 * 86_400_000);
  });

  it('records the courier’s money on a sent order: paid, receipt owed, still on its way', async () => {
    const { service, prisma, order } = withOffline();
    const sent = { ...order, status: 'DISPATCHED', provider: 'COD', paidAt: null, payments: [{ ...PAYMENT, provider: 'COD', providerOrderId: 'cod-pay1' }] };
    prisma.shopOrder.findUniqueOrThrow.mockResolvedValue(sent);
    await service.markPaymentReceived('o1', 'staff-1');
    expect(prisma.shopPayment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) }));
    const update = prisma.shopOrder.update.mock.calls[0][0];
    expect(update.data.paidAt).toBeInstanceOf(Date);
    expect(update.data.status).toBeUndefined();
    expect(prisma.fiscalReceipt.create).toHaveBeenCalledWith({ data: { orderId: 'o1', kind: 'SALE', amountCents: 2990, currency: 'eur' } });
  });

  it('won’t record a hand payment on an order paid by card', async () => {
    const { service, prisma, order } = withOffline();
    prisma.shopOrder.findUniqueOrThrow.mockResolvedValue({ ...order, status: 'AWAITING_PAYMENT', payments: [{ ...PAYMENT }] });
    await expect(service.markPaymentReceived('o1', 'staff-1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CONFLICT' }) });
  });

  it('cancels a refused pay-on-delivery parcel and puts its stock back', async () => {
    const { service, prisma, order } = withOffline();
    prisma.shopOrder.findUniqueOrThrow.mockResolvedValue({ ...order, status: 'DISPATCHED', provider: 'COD', paidAt: null, payments: [{ ...PAYMENT, provider: 'COD' }] });
    await service.cancelByStaff('o1', 'Refused at the door', 'staff-1');
    expect(prisma.shopOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'o1', status: { in: ['AWAITING_PAYMENT', 'CONFIRMED', 'DISPATCHED'] }, paidAt: null } }));
    expect(prisma.shopProduct.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { stock: { increment: 1 } } });
  });
});
