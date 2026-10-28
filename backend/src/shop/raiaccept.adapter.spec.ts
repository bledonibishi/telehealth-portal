import { RaiAcceptAdapter, declineMessage, orderBody } from './raiaccept.adapter';
import type { PaymentStartInput } from './payment-provider';

const config = (values: Record<string, string> = { RAIACCEPT_USERNAME: 'user', RAIACCEPT_PASSWORD: 'pass' }) => ({ get: (key: string) => values[key] }) as any;

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const input: PaymentStartInput = {
  merchantReference: 'OMO-ABC123-1',
  paymentId: 'pay-1',
  amountCents: 6280,
  currency: 'eur',
  description: 'Omopharmacy order OMO-ABC123',
  items: [
    { name: 'Whey protein 1 kg', unitPriceCents: 2990, quantity: 2 },
    { name: 'Delivery', unitPriceCents: 300, quantity: 1 },
  ],
  buyer: { email: 'arta@example.com', firstName: 'Arta', lastName: 'Krasniqi Berisha', phone: '+383 44 123 456' },
  address: { line1: 'Rr. Nëna Terezë 12', city: 'Prishtinë', postalCode: '10000', country: 'XK' },
  urls: { success: 'https://shop.test/s', fail: 'https://shop.test/f', cancel: 'https://shop.test/c', notify: 'https://api.test/n' },
};

describe('RaiAcceptAdapter', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('is offered only once its API credentials are set', () => {
    expect(new RaiAcceptAdapter(config()).isConfigured()).toBe(true);
    expect(new RaiAcceptAdapter(config({})).isConfigured()).toBe(false);
  });

  it('logs in, creates the order, then its payment page, with the same body', async () => {
    fetchMock
      .mockReturnValueOnce(json({ accessToken: 'tok', accessTokenExpiresIn: 299 }))
      .mockReturnValueOnce(json({ orderIdentification: 'D-001-ORD-1' }, 201))
      .mockReturnValueOnce(json({ sessionId: 'S1', paymentRedirectURL: 'https://payment.raiaccept.com/checkout?paymentSession=S1' }, 201));

    const started = await new RaiAcceptAdapter(config()).start(input);

    expect(started).toEqual({ providerOrderId: 'D-001-ORD-1', redirectUrl: 'https://payment.raiaccept.com/checkout?paymentSession=S1' });
    const [login, create, checkout] = fetchMock.mock.calls;
    expect(login[0]).toBe('https://auth.raiaccept.com/auth/api/login');
    expect(JSON.parse(login[1].body)).toMatchObject({ username: 'user', password: 'pass', integrationContext: { type: 'CODE' } });
    expect(create[0]).toBe('https://trapi.raiaccept.com/orders');
    expect(create[1].headers.Authorization).toBe('Bearer tok');
    expect(checkout[0]).toBe('https://trapi.raiaccept.com/orders/D-001-ORD-1/checkout');
    expect(checkout[1].body).toBe(create[1].body);
  });

  it('reuses its access token until shortly before it expires', async () => {
    fetchMock
      .mockReturnValueOnce(json({ accessToken: 'tok', accessTokenExpiresIn: 299 }))
      .mockImplementation(() => json({ status: 'CHECKOUT', invoice: { amount: 62.8, currency: 'EUR', merchantOrderReference: 'OMO-ABC123-1' } }));
    const adapter = new RaiAcceptAdapter(config());
    await adapter.status('D-001-ORD-1');
    await adapter.status('D-001-ORD-1');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/api/login'))).toHaveLength(1);
  });

  it('logs in again once when RaiAccept no longer accepts the token', async () => {
    fetchMock
      .mockReturnValueOnce(json({ accessToken: 'old', accessTokenExpiresIn: 299 }))
      .mockReturnValueOnce(json({}, 401))
      .mockReturnValueOnce(json({ accessToken: 'new', accessTokenExpiresIn: 299 }))
      .mockReturnValueOnce(json({ status: 'DRAFT', invoice: { amount: 62.8, currency: 'EUR' } }));
    const state = await new RaiAcceptAdapter(config()).status('D-001-ORD-1');
    expect(state.status).toBe('PENDING');
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer new');
  });

  it('reads a paid order with its purchase transaction and card, in cents', async () => {
    fetchMock
      .mockReturnValueOnce(json({ accessToken: 'tok', accessTokenExpiresIn: 299 }))
      .mockReturnValueOnce(json({ status: 'PAID', invoice: { amount: 62.8, currency: 'EUR', merchantOrderReference: 'OMO-ABC123-1' } }))
      .mockReturnValueOnce(json([{ transactionId: 'TX-1', transactionType: 'PURCHASE', status: 'SUCCESS', statusCode: '0000' }]))
      .mockReturnValueOnce(json({ transaction: { transactionId: 'TX-1' }, card: { type: 'VISA', maskedCardNumber: '499999******0011' } }));

    expect(await new RaiAcceptAdapter(config()).status('D-001-ORD-1')).toEqual({
      status: 'SUCCEEDED', amountCents: 6280, currency: 'eur', merchantReference: 'OMO-ABC123-1', transactionId: 'TX-1', cardSummary: 'VISA ···· 0011',
    });
  });

  it('says why the bank declined a failed order', async () => {
    fetchMock
      .mockReturnValueOnce(json({ accessToken: 'tok', accessTokenExpiresIn: 299 }))
      .mockReturnValueOnce(json({ status: 'FAILED', invoice: { amount: 62.8, currency: 'EUR' } }))
      // Documented with a single object as the example: accepted as well as a list.
      .mockReturnValueOnce(json({ transactionId: 'TX-2', transactionType: 'PURCHASE', status: 'FAILED', statusCode: '2004' }));
    const state = await new RaiAcceptAdapter(config()).status('D-001-ORD-1');
    expect(state).toMatchObject({ status: 'FAILED', failureCode: '2004', failureMessage: declineMessage('2004') });
  });

  it('refunds in euros against the purchase transaction', async () => {
    fetchMock.mockReturnValueOnce(json({ accessToken: 'tok', accessTokenExpiresIn: 299 })).mockReturnValueOnce(json({ transactionId: 'RF-1' }));
    const id = await new RaiAcceptAdapter(config()).refund({ providerOrderId: 'D-001-ORD-1', providerTransactionId: 'TX-1', currency: 'eur' }, 2990);
    expect(id).toBe('RF-1');
    expect(fetchMock.mock.calls[1][0]).toBe('https://trapi.raiaccept.com/orders/D-001-ORD-1/transactions/TX-1/refund');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ amount: 29.9, currency: 'EUR' });
  });

  it('turns a refusal into an error for the logs, never a silent success', async () => {
    fetchMock.mockReturnValueOnce(json({ accessToken: 'tok', accessTokenExpiresIn: 299 })).mockReturnValueOnce(json({ errors: [{ message: 'bad' }] }, 400));
    await expect(new RaiAcceptAdapter(config()).start(input)).rejects.toThrow(/answered 400/);
  });
});

describe('RaiAccept order body', () => {
  it('sends amounts in euros, leaves out values its rules would refuse, and keeps the rest', () => {
    const body = orderBody(input);
    expect(body.invoice).toEqual({
      amount: 62.8,
      currency: 'EUR',
      description: 'Omopharmacy order OMO-ABC123',
      merchantOrderReference: 'OMO-ABC123-1',
      items: [
        { description: 'Whey protein 1 kg', numberOfItems: 2, price: 29.9 },
        { description: 'Delivery', numberOfItems: 1, price: 3 },
      ],
    });
    // A name with a space doesn't fit "letters, hyphens, apostrophes, periods": left out rather than refused.
    expect(body.consumer).toEqual({ firstName: 'Arta', lastName: undefined, email: 'arta@example.com', mobilePhone: '+38344123456' });
    // Kosovo has no ISO alpha-3 code; the country is left out.
    expect(body.shippingAddress).toEqual({ firstName: 'Arta', lastName: undefined, addressStreet1: 'Rr. Nëna Terezë 12', city: 'Prishtinë', postalCode: '10000', country: undefined });
    expect(orderBody({ ...input, address: { ...input.address, country: 'AL' } }).shippingAddress.country).toBe('ALB');
    expect(body.urls).toEqual({ successUrl: 'https://shop.test/s', failUrl: 'https://shop.test/f', cancelUrl: 'https://shop.test/c', notificationUrl: 'https://api.test/n' });
  });
});
