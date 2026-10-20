'use client';

import { useEffect, useState } from 'react';
import { CONFIG } from './config';

// subscriptionAmountCents is the monthly price on a subscription; an older server doesn't send it.
type DosePrice = { product: string; dose: string; amountCents: number; subscriptionAmountCents?: number; currency: string };

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

/** What a chosen dose costs paid once, and per month on a subscription (10% less), e.g. "£179" and "£161". */
export type TreatmentPrices = { once: string; subscription: string | null };

/**
 * What the server charges for a chosen dose: its own price, plus the progesterone's when that is ticked.
 * Null when it can't be worked out (still loading, or either has no price of its own — the server then
 * charges the plan price instead, so callers show that).
 */
export function useTreatmentPrices(
  product: string | null | undefined,
  dose: string | null | undefined,
  addProgesterone: boolean,
): TreatmentPrices | null {
  const base = useAmount(product, dose);
  const extra = useAmount(addProgesterone ? PROGESTERONE.product : null, PROGESTERONE.dose);
  if (!base) return null;
  if (!addProgesterone) {
    return { once: format(base), subscription: base.subscriptionAmountCents != null ? format({ ...base, amountCents: base.subscriptionAmountCents }) : null };
  }
  if (!extra || extra.currency.toLowerCase() !== base.currency.toLowerCase()) return null;
  const subscription = base.subscriptionAmountCents != null && extra.subscriptionAmountCents != null ? base.subscriptionAmountCents + extra.subscriptionAmountCents : null;
  return {
    once: format({ ...base, amountCents: base.amountCents + extra.amountCents }),
    subscription: subscription != null ? format({ ...base, amountCents: subscription }) : null,
  };
}

/** The one-time price of a chosen dose (see useTreatmentPrices). */
export function useTreatmentPrice(
  product: string | null | undefined,
  dose: string | null | undefined,
  addProgesterone: boolean,
): string | null {
  return useTreatmentPrices(product, dose, addProgesterone)?.once ?? null;
}

// The doctor's prescription fee: shown as its own line, charged with the first payment (and with each new prescription).
export type PrescriptionFee = { amountCents: number; currency: string };
let feePromise: Promise<PrescriptionFee | null> | null = null;
function loadFee(): Promise<PrescriptionFee | null> {
  feePromise ??= fetch(`${CONFIG.API_BASE}/api/checkout/fee`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: PrescriptionFee | null) => (d && d.amountCents > 0 ? d : null))
    .catch(() => null);
  return feePromise;
}

/** The prescription fee to show, e.g. { amountCents: 4000, currency: 'eur' }; null while loading or when there is none. */
export function usePrescriptionFee(): PrescriptionFee | null {
  const [fee, setFee] = useState<PrescriptionFee | null>(null);
  useEffect(() => {
    let live = true;
    loadFee().then((f) => { if (live) setFee(f); });
    return () => { live = false; };
  }, []);
  return fee;
}

/** "€40", in the fee's own currency. */
export function formatFee(fee: PrescriptionFee): string {
  return format({ product: '', dose: '', amountCents: fee.amountCents, currency: fee.currency });
}
