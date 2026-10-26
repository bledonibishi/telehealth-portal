'use client';

import { useEffect, useState } from 'react';
import { CONFIG } from './config';

/* The shop: products sold without a prescription. Prices, stock and payment all come from the backend
   (backend/src/shop); the basket only remembers what and how many. */

export interface ShopProduct {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  description: string;
  imageUrl: string | null;
  category: string | null;
  priceCents: number;
  currency: string;
  inStock: boolean;
  /** How many one order may take now. */
  maxQuantity: number;
}

export interface PaymentMethod {
  key: 'RAIACCEPT' | 'STRIPE' | 'DEV' | 'COD' | 'BANK_TRANSFER';
  /** CARD: paid online now. OFFLINE: paid later, on delivery or by bank transfer. */
  kind: 'CARD' | 'OFFLINE';
  label: string;
  description: string;
}

export interface ShopOptions {
  shippingCents: number;
  freeShippingFromCents: number | null;
  countries: string[];
  currency: string;
  /** Pay on delivery only up to this total, in cents. */
  codMaxCents: number | null;
  transferHoldDays: number;
  paymentMethods: PaymentMethod[];
}

export interface ShopOrderView {
  reference: string;
  status: 'AWAITING_PAYMENT' | 'CONFIRMED' | 'PAID' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
  /** How the buyer chose to pay. */
  provider: PaymentMethod['key'];
  email: string;
  firstName: string;
  items: Array<{ name: string; unitPriceCents: number; quantity: number }>;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  refundedCents: number;
  currency: string;
  shippingAddress: { line1: string; city: string; postalCode: string; country: string };
  paidAt: string | null;
  dispatchedAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  payment: { provider: string; status: string; failureMessage: string | null; cardSummary: string | null } | null;
  paymentMethods: PaymentMethod[];
  /** Where to send the money, while a bank transfer is awaited. */
  bankTransfer: { iban: string; accountName: string; bankName: string | null; reference: string; amountCents: number; payBy: string } | null;
}

/** A failed request, with a message written for the buyer and, for a form, a message per field. */
export class ShopError extends Error {
  constructor(message: string, readonly code: string | null, readonly fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ShopError';
  }
}

const GENERIC = 'Something went wrong on our side. Please try again.';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CONFIG.API_BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
  } catch {
    throw new ShopError('We couldn’t reach the shop. Check your connection and try again.', 'NETWORK');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: unknown; code?: unknown; fields?: Record<string, string> } | null;
    // A 4xx carries a message for the buyer; a 5xx's text is for the logs.
    const message = res.status < 500 || body?.code === 'PAYMENT_PROVIDER_UNAVAILABLE' ? (typeof body?.message === 'string' ? body.message : null) : null;
    throw new ShopError(message ?? GENERIC, typeof body?.code === 'string' ? body.code : null, body?.fields ?? {});
  }
  return res.json() as Promise<T>;
}

export const shopApi = {
  products: () => request<ShopProduct[]>('/api/shop/products'),
  product: (slug: string) => request<ShopProduct>(`/api/shop/products/${encodeURIComponent(slug)}`),
  options: () => request<ShopOptions>('/api/shop/options'),
  createOrder: (body: unknown) => request<{ reference: string; token: string; redirectUrl: string; kind: PaymentMethod['kind'] }>('/api/shop/orders', { method: 'POST', body: JSON.stringify(body) }),
  order: (reference: string, token: string) => request<ShopOrderView>(`/api/shop/orders/${encodeURIComponent(reference)}`, { headers: { 'X-Order-Token': token } }),
  pay: (reference: string, token: string, provider: string) =>
    request<{ redirectUrl: string; kind: PaymentMethod['kind'] }>(`/api/shop/orders/${encodeURIComponent(reference)}/pay`, { method: 'POST', headers: { 'X-Order-Token': token }, body: JSON.stringify({ provider }) }),
  completeTestPayment: (paymentId: string, outcome: 'success' | 'fail' | 'cancel') =>
    request<{ ok: true }>('/api/shop/dev/complete', { method: 'POST', body: JSON.stringify({ paymentId, outcome }) }),
};

/* Products are read once per visit and shared by the header (its categories) and the pages. */
let productsPromise: Promise<ShopProduct[]> | null = null;

export function loadProducts(fresh = false): Promise<ShopProduct[]> {
  if (fresh || !productsPromise) {
    productsPromise = shopApi.products();
    // A failed load is forgotten, so the next page tries again.
    productsPromise.catch(() => {
      productsPromise = null;
    });
  }
  return productsPromise;
}

export function useShopProducts(): { products: ShopProduct[] | null; error: string | null } {
  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadProducts().then(
      (p) => live && setProducts(p),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, []);
  return { products, error };
}

/** The categories in the order their first product appears. */
export const categoriesOf = (products: ShopProduct[]) => [...new Set(products.map((p) => p.category).filter((c): c is string => Boolean(c)))];

export const money = (cents: number, currency = 'eur') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);

/* ── Basket: kept in this browser only. Storage can be missing (private windows); the shop still works for the visit. ── */

export type Basket = Array<{ productId: string; quantity: number }>;

const BASKET_KEY = 'omo_shop_basket';
const ORDERS_KEY = 'omo_shop_orders';
const BASKET_EVENT = 'omo-shop-basket';
/** Fired when something is added, so the "Added to basket" message can show it. */
export const BASKET_ADDED_EVENT = 'omo-shop-added';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the basket lasts until the page is closed */
  }
}

let memoryBasket: Basket | null = null;

export function loadBasket(): Basket {
  if (typeof window === 'undefined') return [];
  const stored = read<Basket>(BASKET_KEY, memoryBasket ?? []);
  return Array.isArray(stored) ? stored.filter((l) => typeof l?.productId === 'string' && Number.isInteger(l.quantity) && l.quantity > 0) : [];
}

export function saveBasket(basket: Basket) {
  memoryBasket = basket.filter((l) => l.quantity > 0);
  write(BASKET_KEY, memoryBasket);
  window.dispatchEvent(new Event(BASKET_EVENT));
}

export function addToBasket(productId: string, quantity: number, max: number) {
  const basket = loadBasket();
  const line = basket.find((l) => l.productId === productId);
  if (line) line.quantity = Math.min(max, line.quantity + quantity);
  else basket.push({ productId, quantity: Math.min(max, quantity) });
  saveBasket(basket);
}

/** Adds to the basket and announces it (see AddedToast). */
export function addToBasketAndTell(product: Pick<ShopProduct, 'id' | 'name' | 'imageUrl' | 'maxQuantity'>, quantity = 1) {
  addToBasket(product.id, quantity, product.maxQuantity);
  window.dispatchEvent(new CustomEvent(BASKET_ADDED_EVENT, { detail: { name: product.name, imageUrl: product.imageUrl, quantity } }));
}

/** The basket, kept up to date when another page or tab changes it. */
export function useBasket(): [Basket, (b: Basket) => void] {
  const [basket, setBasket] = useState<Basket>([]);
  useEffect(() => {
    const sync = () => setBasket(loadBasket());
    sync();
    window.addEventListener(BASKET_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(BASKET_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [basket, saveBasket];
}

/* ── Orders placed from this browser: the token that opens each one's page. ── */

export function rememberOrder(reference: string, token: string) {
  const orders = read<Record<string, string>>(ORDERS_KEY, {});
  orders[reference] = token;
  write(ORDERS_KEY, orders);
}

export function orderToken(reference: string): string | null {
  return read<Record<string, string>>(ORDERS_KEY, {})[reference] ?? null;
}

/**
 * A card form that can sit inside our page: RaiAccept's (frameless, as its docs describe) and the local test page.
 * Stripe's checkout can't be framed, so it stays a redirect. Null: redirect instead.
 */
export function inlineCardFrame(redirectUrl: string): string | null {
  try {
    const url = new URL(redirectUrl, window.location.href);
    if (url.hostname === 'payment.raiaccept.com') {
      url.searchParams.set('mode', 'frameless');
      return url.toString();
    }
    if (url.origin === window.location.origin && url.pathname === '/shop/test-payment') return url.toString();
  } catch {
    /* not a URL we know */
  }
  return null;
}

export const RAIACCEPT_ORIGIN = 'https://payment.raiaccept.com';

export const COUNTRY_NAMES: Record<string, string> = {
  XK: 'Kosovo', AL: 'Albania', MK: 'North Macedonia', ME: 'Montenegro', RS: 'Serbia',
  DE: 'Germany', AT: 'Austria', CH: 'Switzerland', GB: 'United Kingdom', IE: 'Ireland',
};
