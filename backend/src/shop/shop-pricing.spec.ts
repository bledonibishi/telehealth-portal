import { isQuote, normalizeCart, quote, shopSettings, type PricedProduct } from './shop-pricing';

const product = (over: Partial<PricedProduct> = {}): PricedProduct => ({
  id: 'p1', name: 'Whey protein 1 kg', priceCents: 2990, currency: 'eur', vatRate: 18, stock: 10, maxPerOrder: 5, active: true, ...over,
});
const settings = { shippingCents: 300, freeShippingFromCents: 5000, countries: ['XK'], currency: 'eur', codMaxCents: null, transferHoldDays: 3 };

describe('shop pricing', () => {
  it('adds up repeated products and drops quantities that are not whole and positive', () => {
    expect(normalizeCart([{ productId: 'a', quantity: 1 }, { productId: 'a', quantity: 2 }, { productId: 'b', quantity: 0 }, { productId: 'c', quantity: 1.5 }, { quantity: 1 }, { productId: 'd', quantity: '2' }])).toEqual([
      { productId: 'a', quantity: 3 },
      { productId: 'd', quantity: 2 },
    ]);
  });

  it('prices from the products as stored, charging delivery under the free-delivery threshold', () => {
    const q = quote([{ productId: 'p1', quantity: 1 }], [product()], settings);
    expect(isQuote(q) && { subtotal: q.subtotalCents, shipping: q.shippingCents, total: q.totalCents }).toEqual({ subtotal: 2990, shipping: 300, total: 3290 });
  });

  it('delivers free from the threshold', () => {
    const q = quote([{ productId: 'p1', quantity: 2 }], [product()], settings);
    expect(isQuote(q) && q.totalCents).toBe(5980);
  });

  it('refuses products that are gone, inactive, out of stock, or over the per-order limit', () => {
    expect(quote([], [product()], settings)).toEqual({ kind: 'EMPTY' });
    expect(quote([{ productId: 'nope', quantity: 1 }], [product()], settings)).toMatchObject({ kind: 'UNAVAILABLE' });
    expect(quote([{ productId: 'p1', quantity: 1 }], [product({ active: false })], settings)).toMatchObject({ kind: 'UNAVAILABLE' });
    expect(quote([{ productId: 'p1', quantity: 1 }], [product({ stock: 0 })], settings)).toMatchObject({ kind: 'UNAVAILABLE' });
    expect(quote([{ productId: 'p1', quantity: 6 }], [product()], settings)).toMatchObject({ kind: 'TOO_MANY', max: 5 });
    // Never more than are left, whatever the per-order limit.
    expect(quote([{ productId: 'p1', quantity: 3 }], [product({ stock: 2 })], settings)).toMatchObject({ kind: 'TOO_MANY', max: 2 });
  });

  it('reads its settings from the environment, delivering to Kosovo only by default', () => {
    const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as any;
    expect(shopSettings(config({}))).toEqual({ shippingCents: 0, freeShippingFromCents: null, countries: ['XK'], currency: 'eur', codMaxCents: null, transferHoldDays: 3 });
    expect(shopSettings(config({ SHOP_SHIPPING_CENTS: '250', SHOP_FREE_SHIPPING_FROM_CENTS: '4000', SHOP_COUNTRIES: 'xk, al,bad', SHOP_COD_MAX_CENTS: '20000', SHOP_TRANSFER_HOLD_DAYS: '5' }))).toEqual({
      shippingCents: 250, freeShippingFromCents: 4000, countries: ['XK', 'AL'], currency: 'eur', codMaxCents: 20000, transferHoldDays: 5,
    });
  });
});
