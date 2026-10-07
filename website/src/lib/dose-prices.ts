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

/**
 * The monthly price of one dose, e.g. "£179", when that dose is priced on its own (each GLP-1
 * dose is). Null while loading, or for doses billed at their plan's price.
 */
export function useDosePrice(product: string | null | undefined, dose: string | null | undefined): string | null {
  const [price, setPrice] = useState<string | null>(null);
  useEffect(() => {
    if (!product || !dose) {
      setPrice(null);
      return;
    }
    let live = true;
    loadPrices().then((prices) => {
      const found = prices.find((p) => p.product.toLowerCase() === product.toLowerCase() && p.dose === dose);
      if (live) setPrice(found ? format(found) : null);
    });
    return () => {
      live = false;
    };
  }, [product, dose]);
  return price;
}
