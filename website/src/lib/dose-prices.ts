'use client';

import { useEffect, useState } from 'react';
import { CONFIG } from './config';

type DosePrice = { product: string; dose: string; amountCents: number; currency: string };

// Fetched once per page load and shared: every product card asks for it.
let pricesPromise: Promise<DosePrice[]> | null = null;
function loadPrices(): Promise<DosePrice[]> {
  pricesPromise ??= fetch(`${CONFIG.API_BASE}/api/checkout/prices`)
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return pricesPromise;
}

const SYMBOL: Record<string, string> = { gbp: '£', eur: '€', usd: '$' };

function format(p: DosePrice): string {
  const amount = p.amountCents / 100;
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const symbol = SYMBOL[p.currency.toLowerCase()];
  return symbol ? `${symbol}${text}` : `${text} ${p.currency.toUpperCase()}`;
}

function useAmount(product: string | null | undefined, dose: string | null | undefined): DosePrice | null {
  const [price, setPrice] = useState<DosePrice | null>(null);
  useEffect(() => {
    if (!product || !dose) {
      setPrice(null);
      return;
    }
    let live = true;
    loadPrices().then((prices) => {
      const found = prices.find((p) => p.product.toLowerCase() === product.toLowerCase() && p.dose === dose);
      if (live) setPrice(found ?? null);
    });
    return () => {
      live = false;
    };
  }, [product, dose]);
  return price;
}

/**
 * The monthly price of one dose, e.g. "£179", when that dose is priced on its own (each dose of
 * every medicine is). Null while loading, or for doses billed at their plan's price.
 */
export function useDosePrice(product: string | null | undefined, dose: string | null | undefined): string | null {
  const found = useAmount(product, dose);
  return found ? format(found) : null;
}

// The progesterone add-on sold with HRT; the server charges it as a second line at this price.
const PROGESTERONE = { product: 'Utrogestan', dose: '100 mg' };

/**
 * What the server charges for a chosen dose: its own price, plus the progesterone's when that is ticked.
 * Null when it can't be worked out (still loading, or either has no price of its own — the server then
 * charges the plan price instead, so callers show that).
 */
export function useTreatmentPrice(
  product: string | null | undefined,
  dose: string | null | undefined,
  addProgesterone: boolean,
): string | null {
  const base = useAmount(product, dose);
  const extra = useAmount(addProgesterone ? PROGESTERONE.product : null, PROGESTERONE.dose);
  if (!base) return null;
  if (!addProgesterone) return format(base);
  if (!extra || extra.currency.toLowerCase() !== base.currency.toLowerCase()) return null;
  return format({ ...base, amountCents: base.amountCents + extra.amountCents });
}
