import { shopOrderEmail } from './shop-order';

const base = { firstName: 'Arta', reference: 'OMO-7K3P9Q', items: [{ name: 'Whey protein 1 kg', quantity: 1, totalCents: 2990 }], shippingCents: 300, totalCents: 3290, currency: 'eur', orderUrl: 'https://shop.test/shop/order/OMO-7K3P9Q' };

describe('shop order emails', () => {
  it('says a card refund goes back to the card, and a hand refund does not', () => {
    expect(shopOrderEmail({ ...base, kind: 'REFUNDED', refundedCents: 3290 }).html).toContain('to the card you paid with');
    const offline = shopOrderEmail({ ...base, kind: 'REFUNDED', refundedCents: 3290, offline: true }).html;
    expect(offline).not.toContain('card you paid with');
    expect(offline).not.toContain('working days');
  });

  it('never tells a bank-transfer buyer they have paid when the account details are missing', () => {
    const email = shopOrderEmail({ ...base, kind: 'TRANSFER_DETAILS' });
    expect(email.subject).toBe('Order OMO-7K3P9Q is reserved');
    expect(email.html).not.toContain('received your payment');
  });
});
