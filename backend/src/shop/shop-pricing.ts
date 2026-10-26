import type { ConfigService } from '@nestjs/config';

/** How long an unpaid order holds its stock. A new try at paying holds it this long again. */
export const HOLD_MINUTES = 35;

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface PricedProduct {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  vatRate: { toString(): string } | number;
  stock: number;
  maxPerOrder: number;
  active: boolean;
}

export interface Quote {
  lines: Array<{ productId: string; name: string; unitPriceCents: number; quantity: number; vatRate: string }>;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
}

export interface ShopSettings {
  /** Delivery charge in cents; 0 is free delivery. */
  shippingCents: number;
  /** Orders from this subtotal (in cents) are delivered free. Null: no threshold. */
  freeShippingFromCents: number | null;
  /** ISO alpha-2 codes the shop delivers to. */
  countries: string[];
  currency: string;
  /** Pay on delivery only up to this total, in cents (a refused parcel costs the delivery both ways). Null: no limit. */
  codMaxCents: number | null;
  /** How many days a bank-transfer order holds its stock while the money is on its way. */
  transferHoldDays: number;
}

const intOr = (value: string | undefined, fallback: number | null) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * From SHOP_SHIPPING_CENTS, SHOP_FREE_SHIPPING_FROM_CENTS, SHOP_COUNTRIES (default: Kosovo only), SHOP_COD_MAX_CENTS
 * and SHOP_TRANSFER_HOLD_DAYS (default 3).
 */
export function shopSettings(config: Pick<ConfigService, 'get'>): ShopSettings {
  const countries = (config.get<string>('SHOP_COUNTRIES') || 'XK')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  return {
    shippingCents: intOr(config.get<string>('SHOP_SHIPPING_CENTS'), 0)!,
    freeShippingFromCents: intOr(config.get<string>('SHOP_FREE_SHIPPING_FROM_CENTS'), null),
    countries: countries.length ? countries : ['XK'],
    currency: 'eur',
    codMaxCents: intOr(config.get<string>('SHOP_COD_MAX_CENTS'), null),
    transferHoldDays: Math.max(1, intOr(config.get<string>('SHOP_TRANSFER_HOLD_DAYS'), 3)!),
  };
}

/** Adds up repeated products and drops anything that isn't a whole, positive quantity. */
export function normalizeCart(items: Array<{ productId?: unknown; quantity?: unknown }> | undefined): CartLine[] {
  const totals = new Map<string, number>();
  for (const item of items ?? []) {
    const quantity = Number(item?.quantity);
    if (typeof item?.productId !== 'string' || !item.productId || !Number.isInteger(quantity) || quantity < 1) continue;
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + quantity);
  }
  return [...totals].map(([productId, quantity]) => ({ productId, quantity }));
}

export type QuoteProblem =
  | { kind: 'EMPTY' }
  | { kind: 'UNAVAILABLE'; productId: string; name?: string }
  | { kind: 'TOO_MANY'; productId: string; name: string; max: number }
  | { kind: 'MIXED_CURRENCY' };

/**
 * Prices a basket from the products as they are now: the buyer's browser only says what and how many. Returns the
 * first problem instead when something can't be bought.
 */
export function quote(cart: CartLine[], products: PricedProduct[], settings: ShopSettings): Quote | QuoteProblem {
  if (!cart.length) return { kind: 'EMPTY' };
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: Quote['lines'] = [];
  for (const line of cart) {
    const product = byId.get(line.productId);
    if (!product || !product.active || product.stock < 1) return { kind: 'UNAVAILABLE', productId: line.productId, name: product?.name };
    const max = Math.min(product.maxPerOrder, product.stock);
    if (line.quantity > max) return { kind: 'TOO_MANY', productId: product.id, name: product.name, max };
    if (product.currency !== settings.currency) return { kind: 'MIXED_CURRENCY' };
    lines.push({ productId: product.id, name: product.name, unitPriceCents: product.priceCents, quantity: line.quantity, vatRate: product.vatRate.toString() });
  }
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const free = settings.freeShippingFromCents !== null && subtotalCents >= settings.freeShippingFromCents;
  const shippingCents = free ? 0 : settings.shippingCents;
  return { lines, subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents, currency: settings.currency };
}

export const isQuote = (value: Quote | QuoteProblem): value is Quote => 'lines' in value;
