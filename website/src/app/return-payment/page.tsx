'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { CONFIG } from '@/lib/config';
import BillingChoice from '@/components/BillingChoice';
import { DEFAULT_BILLING, type BillingChoice as Choice } from '@/lib/billing-choice';
import { loadReturnOffer, startReturnSubscription, type ReturnOffer, type ReturnSubscription } from '@/lib/returning';

const money = (cents: number | null, currency: string | null) =>
  cents == null ? '' : new Intl.NumberFormat('en', { style: 'currency', currency: (currency ?? 'eur').toUpperCase() }).format(cents / 100);

/**
 * A refunded patient whose prescription is still valid pays for the medicine alone, here in our own checkout instead of on
 * Stripe's invoice page. The payment is that invoice's own payment, so the usual payment event reopens their account.
 */
function ReturnPaymentInner() {
  const params = useSearchParams();
  const status = params.get('redirect_status');
  const [saved, setSaved] = useState<{ offer: ReturnOffer; email: string; token: string } | null>(null);
  const offer: ReturnOffer | null = saved?.offer ?? null;
  const [choice, setChoice] = useState<Choice>(DEFAULT_BILLING);
  const [subscription, setSubscription] = useState<ReturnSubscription | null>(null);
  const [starting, setStarting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [complete, setComplete] = useState(false);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const mountRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<null | (() => Promise<{ error?: { message?: string } }>)>(null);

  useEffect(() => { setSaved(loadReturnOffer()); setLoaded(true); }, []);

  // Subscribing is made when it is chosen (the one-off invoice already exists); if it can't be, they are left on paying once.
  useEffect(() => {
    if (!saved || choice !== 'SUBSCRIPTION' || subscription || status) return;
    let cancelled = false;
    setStarting(true);
    setError('');
    startReturnSubscription(saved.email, saved.token)
      .then((s) => { if (!cancelled) setSubscription(s); })
      .catch((e) => { if (!cancelled) { setChoice('ONE_TIME'); setError(e instanceof Error ? e.message : 'We couldn’t start the subscription. You can pay once instead.'); } })
      .finally(() => { if (!cancelled) setStarting(false); });
    return () => { cancelled = true; };
  }, [saved, choice, subscription, status]);

  const subscribing = choice === 'SUBSCRIPTION' && !!subscription;
  const secret = choice === 'SUBSCRIPTION' ? subscription?.clientSecret ?? null : offer?.clientSecret ?? null;

  useEffect(() => {
    const mount = mountRef.current;
    if (!secret || !mount || !CONFIG.STRIPE_PUBLISHABLE_KEY || status) return;
    setReady(false);
    setComplete(false);
    let cancelled = false;
    mount.innerHTML = '<div class="pv-skel"></div><div class="pv-skel"></div>';
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
      const stripe: any = (window as any)['Stripe'](CONFIG.STRIPE_PUBLISHABLE_KEY);
      const elements = stripe.elements({
        clientSecret: secret,
        appearance: { theme: 'stripe', variables: { colorPrimary: '#0C6F6A', colorText: '#0A3836', borderRadius: '12px', fontFamily: 'Inter, system-ui, sans-serif' } },
        fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap' }],
      });
      const pe = elements.create('payment', { layout: 'tabs' });
      confirmRef.current = () => stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/return-payment` } });
      mount.innerHTML = '';
      pe.mount(mount);
      pe.on('change', (ev: any) => setComplete(!!ev.complete));
      /* eslint-enable @typescript-eslint/no-explicit-any */
      setReady(true);
    }).catch(() => { if (!cancelled) setError('The payment form could not load. Please use the link we emailed you, or try again.'); });
    return () => { cancelled = true; mount.innerHTML = ''; };
  }, [secret, status]);

  const pay = async () => {
    if (!confirmRef.current || paying) return;
    setPaying(true);
    setError('');
    const result = await confirmRef.current();
    // Only reached when the payment did not go through (a successful one leaves the page).
    if (result?.error) setError(result.error.message ?? 'The payment did not go through. Please try again.');
    setPaying(false);
  };

  if (status === 'succeeded' || status === 'processing') {
    return (
      <main className="pv-result-page">
        <div className="pv-result-card">
          <div className="pv-result-icon">✓</div>
          <h1>{status === 'succeeded' ? 'Payment received' : 'Your payment is being processed'}</h1>
          <p>Your account is open again, and your medicine goes to the pharmacy as soon as the payment is confirmed. Sign in with your usual email and password to follow your order.</p>
          <a className="th-co-pay-btn" href={`${CONFIG.PORTAL_URL}/login`} style={{ textDecoration: 'none' }}>Sign in</a>
        </div>
      </main>
    );
  }
  if (status === 'failed') {
    return (
      <main className="pv-result-page">
        <div className="pv-result-card">
          <div className="pv-result-icon cancel">✕</div>
          <h1>The payment didn’t go through</h1>
          <p>Nothing was charged. Go back to try again, or use the payment link we emailed you.</p>
          <Link className="th-co-pay-btn" href="/return-payment" style={{ textDecoration: 'none' }}>Try again</Link>
        </div>
      </main>
    );
  }

  const oncePrice = offer ? money(offer.amountCents, offer.currency) : '';
  // The subscription costs 10% less: shown from the one-off price until the server has made the real one.
  const fullOnce = offer?.totalCents ?? offer?.amountCents ?? null;
  const subShown = subscription ? money(subscription.amountDueCents, subscription.currency) : fullOnce != null ? money(Math.round(fullOnce * 0.9), offer?.currency ?? 'eur') : '';
  const price = choice === 'SUBSCRIPTION' ? subShown : oncePrice;
  const credit = subscribing && subscription ? subscription.totalCents - subscription.amountDueCents : choice === 'ONE_TIME' && offer?.totalCents != null && offer.amountCents != null ? offer.totalCents - offer.amountCents : 0;
  const lineTotal = subscribing && subscription ? subscription.totalCents : choice === 'ONE_TIME' && offer?.totalCents != null ? offer.totalCents : null;
  return (
    <>
      <Navbar />
      <main>
        <div className="pv-page-head">
          <div className="container">
            <div className="pv-page-head-tag">Secure Checkout</div>
            <h1 className="pv-page-head-h1">Order your medicine</h1>
          </div>
        </div>
        <div className="th-co-grid">
          {loaded && !offer ? (
            <div className="th-co-main">
              <div className="th-co-card">
                <p className="pv-panel-note">We couldn’t find your order here. Take the assessment again with your email and we’ll bring you back to it.</p>
                <Link className="th-co-pay-btn" href="/" style={{ textDecoration: 'none' }}>Back to the start</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="th-co-main">
                <div className="th-co-card">
                  {offer?.clientSecret && (
                    <>
                      <div className="th-co-section-label">How would you like to pay?</div>
                      <BillingChoice value={choice} onChange={(v) => { setChoice(v); setError(''); }} prices={{ once: oncePrice, subscription: subShown }} name="return-billing" />
                    </>
                  )}
                  <div className="th-co-section-label" style={{ marginTop: 20 }}>Payment</div>
                  {starting && !secret ? (
                    <div><div className="pv-skel" /><div className="pv-skel" /></div>
                  ) : secret ? (
                    <>
                      <div ref={mountRef} />
                      <button className="th-co-pay-btn" aria-disabled={!ready || !complete || paying ? 'true' : undefined} aria-busy={paying ? 'true' : undefined} onClick={pay}>
                        {paying ? 'Processing…' : subscribing ? `Subscribe · ${price} / month` : `Pay ${price}`}
                      </button>
                    </>
                  ) : offer?.payUrl ? (
                    <a className="th-co-pay-btn" href={offer.payUrl} style={{ textDecoration: 'none' }}>Continue to payment {price && `· ${price}`}</a>
                  ) : (
                    <p className="pv-panel-note">We’ve emailed you the link to pay. Check your inbox, and your spam folder.</p>
                  )}
                  {error && <div className="th-co-pay-error">{error}</div>}
                  <p className="th-co-secure">Payments are processed securely by Stripe. We never see or store your card details.</p>
                </div>
              </div>
              <aside className="th-co-side">
                <div className="th-co-card">
                  <div className="th-co-section-label">Your order</div>
                  <div className="th-co-sum-product">{offer?.treatment ?? 'Your treatment'}</div>
                  <div className="th-co-row"><span>{choice === 'SUBSCRIPTION' ? 'Medicine · billed monthly' : 'Medicine'}</span><span>{credit > 0 && lineTotal != null ? money(lineTotal, offer?.currency ?? 'eur') : price}</span></div>
                  {credit > 0 && (
                    <div className="th-co-row reward"><span>Voucher credit</span><span>−{money(credit, offer?.currency ?? 'eur')}</span></div>
                  )}
                  <div className="th-co-row"><span>Prescription fee</span><span>Already paid</span></div>
                  <div className="th-co-row total"><span>Due today</span><span>{price}</span></div>
                  {offer && offer.unusedVoucherCents > 0 && (
                    <p className="th-co-note">You also have {money(offer.unusedVoucherCents, offer.currency)} in vouchers that haven’t been used. Sign in after you pay and apply them under Rewards: they come off your next order.</p>
                  )}
                  {choice === 'SUBSCRIPTION' && <p className="th-co-note">Your subscription renews every month until you cancel. You can cancel any time from Settings, and ask for a refund.</p>}
                  <p className="th-co-note">Your prescription is valid until {offer ? new Date(offer.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}. This is the medicine your doctor prescribed, so the dose can’t be changed here.</p>
                </div>
              </aside>
            </>
          )}
        </div>
      </main>
    </>
  );
}

export default function ReturnPaymentPage() {
  return (
    <Suspense fallback={null}>
      <ReturnPaymentInner />
    </Suspense>
  );
}
