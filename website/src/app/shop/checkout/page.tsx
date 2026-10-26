'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PaymentMethods from '@/components/shop/PaymentMethods';
import CardFrame from '@/components/shop/CardFrame';
import { COUNTRY_NAMES, ShopError, inlineCardFrame, loadProducts, money, rememberOrder, shopApi, useBasket, type ShopOptions, type ShopProduct } from '@/lib/shop';

interface Details {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  city: string;
  postalCode: string;
  country: string;
}

const EMPTY: Details = { email: '', firstName: '', lastName: '', phone: '', line1: '', city: '', postalCode: '', country: '' };
const REQUIRED: Array<keyof Details> = ['email', 'firstName', 'lastName', 'line1', 'city', 'country'];

export default function ShopCheckoutPage() {
  const [basket, setBasket] = useBasket();
  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [options, setOptions] = useState<ShopOptions | null>(null);
  const [details, setDetails] = useState<Details>(EMPTY);
  const [provider, setProvider] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  // The order placed and its card form, once the buyer has pressed Pay with a card that opens inside the page.
  const [cardOrder, setCardOrder] = useState<{ reference: string; frameUrl: string; lines: Array<{ product: ShopProduct; quantity: number }>; subtotal: number; shipping: number; total: number } | null>(null);

  const load = useCallback((fresh = false) => {
    return Promise.all([loadProducts(fresh), shopApi.options()]).then(
      ([p, o]) => {
        setProducts(p);
        setOptions(o);
        setDetails((d) => (d.country ? d : { ...d, country: o.countries[0] ?? '' }));
        setProvider((current) => current ?? o.paymentMethods[0]?.key ?? null);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The basket as it can be bought now: products gone from the shop drop out, quantities are capped at what's left.
  const lines = useMemo(() => {
    if (!products) return [];
    const byId = new Map(products.map((p) => [p.id, p]));
    return basket.flatMap((l) => {
      const p = byId.get(l.productId);
      return p ? [{ product: p, quantity: Math.min(l.quantity, Math.max(p.maxQuantity, 0)) }] : [];
    });
  }, [basket, products]);
  const buyable = lines.filter((l) => l.quantity > 0);

  const subtotal = buyable.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0);
  const free = options?.freeShippingFromCents != null && subtotal >= options.freeShippingFromCents;
  const shipping = options && !free ? options.shippingCents : 0;
  const total = subtotal + shipping;
  const currency = options?.currency ?? 'eur';

  const setQuantity = (productId: string, quantity: number) =>
    setBasket(basket.map((l) => (l.productId === productId ? { ...l, quantity } : l)).filter((l) => l.quantity > 0));

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setDetails((d) => ({ ...d, [k]: e.target.value }));
    setFieldErrors(({ [k]: _done, ...rest }) => rest);
  };
  const method = options?.paymentMethods.find((m) => m.key === provider) ?? null;
  // The courier calls before delivering a parcel that is paid on delivery.
  const required: Array<keyof Details> = provider === 'COD' ? [...REQUIRED, 'phone'] : REQUIRED;
  const fieldError = (k: keyof Details) => fieldErrors[k] ?? (touched && required.includes(k) && !details[k].trim() ? 'Required' : null);

  const pay = async () => {
    setTouched(true);
    setError(null);
    if (required.some((k) => !details[k].trim()) || !provider || !buyable.length) return;
    setPaying(true);
    try {
      const order = await shopApi.createOrder({
        items: buyable.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        email: details.email,
        firstName: details.firstName,
        lastName: details.lastName,
        phone: details.phone || undefined,
        address: { line1: details.line1, city: details.city, postalCode: details.postalCode, country: details.country },
        provider,
        expectedTotalCents: total,
      });
      rememberOrder(order.reference, order.token);
      setBasket([]);
      const frameUrl = order.kind === 'CARD' ? inlineCardFrame(order.redirectUrl) : null;
      if (frameUrl) {
        // The basket is now the order: keep showing what was ordered while the card form is open.
        setCardOrder({ reference: order.reference, frameUrl, lines: buyable, subtotal, shipping, total });
        setPaying(false);
        return;
      }
      window.location.assign(order.redirectUrl);
    } catch (e) {
      const err = e instanceof ShopError ? e : new ShopError('Something went wrong on our side. Please try again.', null);
      setFieldErrors(err.fields);
      setError(err.message);
      // Prices or stock changed: show the basket as it is now.
      if (err.code === 'SHOP_PRICE_CHANGED' || err.code === 'SHOP_OUT_OF_STOCK') await load(true);
      setPaying(false);
    }
  };

  const loading = !products || !options;

  return (
    <>
      <main>
        <div className="sh-page-head sh-rise">
          <span className="sh-eyebrow">Secure checkout</span>
          <h1>Your basket</h1>
        </div>

        {!loading && basket.length === 0 && !cardOrder && (
          <div className="sh-empty-basket sh-rise">
            <p>Your basket is empty.</p>
            <Link href="/shop" className="sh-btn sh-btn-primary">Browse the shop</Link>
          </div>
        )}

        {(loading || basket.length > 0 || cardOrder) && (
          <div className="th-co-grid">
            <div className="th-co-main">
              <div className="th-co-card">
                <div className="th-co-section-label">Your details</div>
                <div className="th-co-fields">
                  <Field id="email" label="Email" full error={fieldError('email')}>
                    <input id="email" type="email" autoComplete="email" value={details.email} onChange={set('email')} aria-invalid={!!fieldError('email')} />
                  </Field>
                  <Field id="firstName" label="First name" error={fieldError('firstName')}>
                    <input id="firstName" autoComplete="given-name" value={details.firstName} onChange={set('firstName')} aria-invalid={!!fieldError('firstName')} />
                  </Field>
                  <Field id="lastName" label="Last name" error={fieldError('lastName')}>
                    <input id="lastName" autoComplete="family-name" value={details.lastName} onChange={set('lastName')} aria-invalid={!!fieldError('lastName')} />
                  </Field>
                  <Field id="phone" label={provider === 'COD' ? 'Phone (the courier calls before delivering)' : 'Phone (for the courier, optional)'} full error={fieldError('phone')}>
                    <input id="phone" type="tel" autoComplete="tel" value={details.phone} onChange={set('phone')} aria-invalid={!!fieldError('phone')} />
                  </Field>
                </div>
              </div>

              <div className="th-co-card">
                <div className="th-co-section-label">Delivery address</div>
                <div className="th-co-fields">
                  <Field id="line1" label="Street address" full error={fieldError('line1')}>
                    <input id="line1" autoComplete="address-line1" value={details.line1} onChange={set('line1')} aria-invalid={!!fieldError('line1')} />
                  </Field>
                  <Field id="city" label="City" error={fieldError('city')}>
                    <input id="city" autoComplete="address-level2" value={details.city} onChange={set('city')} aria-invalid={!!fieldError('city')} />
                  </Field>
                  <Field id="postalCode" label="Postal code" error={fieldError('postalCode')}>
                    <input id="postalCode" autoComplete="postal-code" value={details.postalCode} onChange={set('postalCode')} aria-invalid={!!fieldError('postalCode')} />
                  </Field>
                  <Field id="country" label="Country" full error={fieldError('country')}>
                    <select id="country" autoComplete="country" value={details.country} onChange={set('country')}>
                      {(options?.countries ?? []).map((c) => <option key={c} value={c}>{COUNTRY_NAMES[c] ?? c}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="th-co-card">
                <div className="th-co-section-label">Payment</div>
                {options && options.paymentMethods.length === 0 && <p className="shop-error">Payments aren’t available right now. Please try again later.</p>}
                {options && (
                  <PaymentMethods
                    methods={options.paymentMethods}
                    value={provider}
                    onChange={setProvider}
                    totalCents={cardOrder?.total ?? total}
                    currency={currency}
                    codMaxCents={options.codMaxCents}
                    transferHoldDays={options.transferHoldDays}
                    disabled={!!cardOrder || paying}
                    cardFrame={cardOrder ? <CardFrame reference={cardOrder.reference} src={cardOrder.frameUrl} /> : undefined}
                  />
                )}
                {fieldErrors.provider && <div className="th-co-pay-error">{fieldErrors.provider}</div>}
              </div>
            </div>

            <aside className="th-co-side">
              <div className="th-co-card">
                <div className="th-co-section-label">Order summary</div>
                {loading && <div className="pv-skel" style={{ height: 120 }} />}
                {(cardOrder?.lines ?? lines).map(({ product, quantity }) => (
                  <div key={product.id} className="shop-line">
                    <div className="shop-line-name">
                      {product.name}
                      {quantity === 0 && <span className="shop-soldout"> · out of stock</span>}
                    </div>
                    <div className="shop-line-row">
                      {cardOrder ? (
                        <span>× {quantity}</span>
                      ) : (
                        <div className="shop-qty small">
                          <button type="button" onClick={() => setQuantity(product.id, quantity - 1)} aria-label={`One fewer ${product.name}`}>−</button>
                          <span>{quantity}</span>
                          <button type="button" onClick={() => setQuantity(product.id, Math.min(product.maxQuantity, quantity + 1))} disabled={quantity >= product.maxQuantity} aria-label={`One more ${product.name}`}>+</button>
                        </div>
                      )}
                      <span>{money(product.priceCents * quantity, currency)}</span>
                    </div>
                  </div>
                ))}
                <div className="th-co-row"><span>Subtotal</span><span>{money(cardOrder?.subtotal ?? subtotal, currency)}</span></div>
                <div className="th-co-row"><span>Delivery</span><span>{(cardOrder?.shipping ?? shipping) ? money(cardOrder?.shipping ?? shipping, currency) : 'Free'}</span></div>
                {!cardOrder && options?.freeShippingFromCents != null && !free && shipping > 0 && (
                  <p className="th-co-note">Free delivery from {money(options.freeShippingFromCents, currency)}.</p>
                )}
                <div className="th-co-row total"><span>Total</span><span>{money(cardOrder?.total ?? total, currency)}</span></div>

                {cardOrder ? (
                  <div className="pm-waiting">
                    <strong>Order {cardOrder.reference} is reserved.</strong> Enter your card details in the secure form to finish.{' '}
                    <Link href={`/shop/order/${encodeURIComponent(cardOrder.reference)}`}>Pay another way</Link>
                  </div>
                ) : (
                  <button type="button" className="th-co-pay-btn" onClick={pay} disabled={paying || loading || !buyable.length || !provider}>
                    {paying ? 'One moment…' : method?.kind === 'OFFLINE' ? `Place order · ${money(total, currency)}` : `Pay ${money(total, currency)}`}
                  </button>
                )}
                {error && <div className="th-co-pay-error" role="alert">{error}</div>}
                <p className="th-co-secure">
                  {method?.kind === 'OFFLINE'
                    ? 'Nothing is charged now. We’ll email you your order confirmation.'
                    : 'Card payments go through the bank’s secure system, and your bank may ask you to approve them in its app or with an SMS code. We never see or store your card details.'}
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}

function Field({ id, label, full, error, children }: { id: string; label: string; full?: boolean; error: string | null; children: React.ReactNode }) {
  return (
    <div className={`th-co-field${full ? ' full' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <span className="shop-field-error">{error}</span>}
    </div>
  );
}
