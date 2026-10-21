'use client';

import { useEffect, useRef, useState } from 'react';
import { btnPrimary } from '@/components/portal/Card';

const KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

/**
 * Pays for an extra consultation inside the portal, with Stripe's payment form, instead of sending the patient to Stripe's
 * invoice page. Without a publishable key (or if the form can't load) the hosted link is used.
 */
export function ConsultPayment({ clientSecret, amountLabel, fallbackUrl }: { clientSecret: string | null | undefined; amountLabel: string; fallbackUrl?: string | null }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<null | (() => Promise<{ error?: { message?: string } }>)>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!open || !clientSecret || !KEY || !mount) return;
    let cancelled = false;
    const load = new Promise<void>((res, rej) => {
      if ((window as unknown as Record<string, unknown>)['Stripe']) { res(); return; }
      const s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error('Stripe.js failed to load'));
      document.head.appendChild(s);
    });
    load.then(() => {
      if (cancelled) return;
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const stripe: any = (window as any)['Stripe'](KEY);
      const elements = stripe.elements({ clientSecret, appearance: { theme: 'stripe', variables: { borderRadius: '10px' } } });
      const pe = elements.create('payment', { layout: 'tabs' });
      confirmRef.current = () => stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/appointments?paid=1` } });
      pe.mount(mount);
      pe.on('change', (ev: any) => setComplete(!!ev.complete));
      /* eslint-enable @typescript-eslint/no-explicit-any */
      setReady(true);
    }).catch(() => { if (!cancelled) setBroken(true); });
    return () => { cancelled = true; mount.innerHTML = ''; setReady(false); };
  }, [open, clientSecret]);

  // Nothing to pay inside the portal with: the hosted invoice page it is.
  if (!clientSecret || !KEY || broken) {
    return fallbackUrl ? <a href={fallbackUrl} target="_blank" rel="noreferrer" className={`${btnPrimary} !py-1.5 !text-xs mt-2 inline-flex`}>Pay now</a> : null;
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={`${btnPrimary} !py-1.5 !text-xs mt-2`}>Pay {amountLabel}</button>;

  const pay = async () => {
    if (!confirmRef.current || paying) return;
    setPaying(true);
    setError('');
    const result = await confirmRef.current();
    // Only reached when the payment did not go through (a successful one leaves the page).
    if (result?.error) setError(result.error.message ?? 'The payment did not go through. Please try again.');
    setPaying(false);
  };

  return (
    <div className="mt-3 rounded-lg bg-white border border-slate-200 p-4">
      <div ref={mountRef} />
      {error && <p role="alert" className="text-xs text-red-700 mt-2">{error}</p>}
      <button type="button" disabled={!ready || !complete || paying} onClick={pay} className={`${btnPrimary} w-full mt-3 disabled:opacity-50`}>{paying ? 'Processing…' : `Pay ${amountLabel}`}</button>
      <p className="text-[11px] text-slate-500 mt-2">Payments are processed securely by Stripe. We never see or store your card details.</p>
    </div>
  );
}
