'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { CONFIG, type PlanKey } from '@/lib/config';
import { loadAssessment, mergeAssessment } from '@/lib/storage';

/* ── Types ── */
type PayMethod = 'stripe' | 'paysera';
interface PayseraMethod { key: string; title: string; logo?: string; group?: string }

/* ── Helper ── */
async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json() as Promise<T>;
}

/* ── Stripe inline element mount ── */
function StripeMount({
  priceId, planName, email, leadId, onReady, onComplete,
}: {
  priceId: string; planName: string; email?: string; leadId?: string | null;
  onReady: (mode: 'element' | 'redirect') => void;
  onComplete: (complete: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const peRef = useRef<unknown>(null);

  useEffect(() => {
    if (!ref.current) return;
    const mount = ref.current;

    if (!CONFIG.STRIPE_PUBLISHABLE_KEY) {
      mount.innerHTML = '<p class="pv-panel-note">You will enter your card details on Stripe\'s secure checkout page in the next step.</p>';
      onReady('redirect');
      return;
    }

    mount.innerHTML =
      '<div class="pv-skel"></div><div class="pv-skel"></div><div class="pv-skel" style="width:60%"></div>';

    const apiBase = CONFIG.API_BASE;
    Promise.all([
      new Promise<void>((res, rej) => {
        if ((window as unknown as Record<string, unknown>)['Stripe']) { res(); return; }
        const s = document.createElement('script');
        s.src = 'https://js.stripe.com/v3/';
        s.async = true;
        s.onload = () => res();
        s.onerror = () => rej(new Error('Stripe.js failed to load'));
        document.head.appendChild(s);
      }),
      post<{ clientSecret: string; intentType?: string }>(
        `${apiBase}/api/checkout/stripe-intent`,
        { priceId, planName, email: email ?? null, leadId: leadId ?? null },
      ),
    ])
      .then(([, d]) => {
        if (!d?.clientSecret) throw new Error('No client secret');
        const stripe = (window as unknown as Record<string, (k: string) => unknown>)['Stripe'](CONFIG.STRIPE_PUBLISHABLE_KEY);
        const elements = (stripe as Record<string, (o: unknown) => unknown>)['elements']({
          clientSecret: d.clientSecret,
          appearance: {
            theme: 'stripe',
            variables: { colorPrimary: '#1E4FD8', colorText: '#0E1A2B', borderRadius: '12px', fontFamily: 'Inter, system-ui, sans-serif' },
          },
          fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap' }],
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pe = (elements as any).create('payment', {
          layout: 'tabs',
          defaultValues: { billingDetails: { email: email ?? '' } },
        });
        (peRef as { current: unknown }).current = pe;
        mount.innerHTML = '';
        pe.mount(mount);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pe.on('change', (ev: any) => onComplete(ev.complete));
        onReady('element');
      })
      .catch((ex) => {
        console.warn('[checkout] Stripe inline unavailable:', ex);
        mount.innerHTML = '<p class="pv-panel-note">You will enter your card details on Stripe\'s secure checkout page in the next step.</p>';
        onReady('redirect');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} />;
}

/* ── Paysera methods grid ── */
function PayseraMount({
  planKey, savedMethod, onReady, onSelect,
}: {
  planKey: string; savedMethod?: string | null;
  onReady: (mode: 'list' | 'redirect') => void;
  onSelect: (key: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.innerHTML = '<div class="pv-skel"></div><div class="pv-skel"></div>';

    const apiBase = CONFIG.API_BASE;
    fetch(`${apiBase}/api/checkout/paysera/methods?plan=${encodeURIComponent(planKey)}`)
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d: { methods: PayseraMethod[] }) => {
        const list = d?.methods ?? [];
        if (!list.length) throw new Error('No methods');

        const grid = document.createElement('div');
        grid.className = 'pvm-grid';
        grid.setAttribute('role', 'radiogroup');
        grid.setAttribute('aria-label', 'Bank or payment method');

        let lastGroup: string | undefined;
        list.forEach((m) => {
          if (m.group && m.group !== lastGroup) {
            const g = document.createElement('div');
            g.className = 'pvm-group';
            g.textContent = m.group;
            grid.appendChild(g);
            lastGroup = m.group;
          }
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'pvm-tile';
          b.setAttribute('aria-pressed', 'false');
          b.setAttribute('data-pm', m.key);
          if (m.logo) {
            const img = document.createElement('img');
            img.src = m.logo; img.alt = ''; img.loading = 'lazy';
            b.appendChild(img);
          }
          const t = document.createElement('span');
          t.textContent = m.title ?? m.key;
          b.appendChild(t);
          grid.appendChild(b);
        });

        grid.addEventListener('click', (e) => {
          const btn = (e.target as HTMLElement).closest('.pvm-tile') as HTMLButtonElement | null;
          if (!btn) return;
          grid.querySelectorAll('.pvm-tile').forEach((x) => x.setAttribute('aria-pressed', x === btn ? 'true' : 'false'));
          const key = btn.getAttribute('data-pm')!;
          mergeAssessment({ payseraMethod: key });
          onSelect(key);
        });

        box.innerHTML = '';
        box.appendChild(grid);
        onReady('list');

        if (savedMethod) {
          const saved = grid.querySelector<HTMLButtonElement>(`[data-pm="${savedMethod}"]`);
          if (saved) saved.click();
        }
      })
      .catch((ex) => {
        console.warn('[checkout] Paysera methods unavailable:', ex);
        box.innerHTML = '<p class="pv-panel-note">You will choose your bank or card on Paysera\'s secure page in the next step.</p>';
        onReady('redirect');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} />;
}

/* ── Inner component uses useSearchParams (must be inside Suspense) ── */
function CheckoutInner() {
  const searchParams = useSearchParams();
  const planKeyParam = searchParams.get('plan') as PlanKey | null;

  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<ReturnType<typeof loadAssessment>>(null);
  const [planKey, setPlanKey] = useState<PlanKey | null>(null);

  const [chosen, setChosen] = useState<PayMethod | null>(null);
  const [stripeMode, setStripeMode] = useState<'element' | 'redirect' | null>(null);
  const [stripeComplete, setStripeComplete] = useState(false);
  const [payseraMode, setPayseraMode] = useState<'list' | 'redirect' | null>(null);
  const [payseraMethod, setPayseraMethod] = useState<string | null>(null);

  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  useEffect(() => {
    const s = loadAssessment();
    const key = (planKeyParam ?? s?.plan ?? null) as PlanKey | null;
    setSession(s);
    setPlanKey(key);
    setReady(true);
    if (key) mergeAssessment({ plan: key });
    if (s?.method) {
      setChosen(s.method as PayMethod);
    }
    if (s?.payseraMethod) setPayseraMethod(s.payseraMethod);
  }, [planKeyParam]);

  const plan = planKey ? CONFIG.PLANS[planKey] : null;
  const eligible = !!session?.passed && !!plan && plan.product === session?.product;

  const canPay = useCallback(() => {
    if (chosen === 'stripe') return stripeMode === 'redirect' || (stripeMode === 'element' && stripeComplete);
    if (chosen === 'paysera') return payseraMode === 'redirect' || (payseraMode === 'list' && !!payseraMethod);
    return false;
  }, [chosen, stripeMode, stripeComplete, payseraMode, payseraMethod]);

  const handlePay = async () => {
    if (!canPay() || !plan || !planKey) return;
    setPayError('');
    setPaying(true);

    try {
      if (chosen === 'stripe' && stripeMode === 'redirect') {
        const d = await post<{ url: string }>('/api/checkout', { priceId: plan.priceId, planName: plan.name });
        if (!d?.url) throw new Error('No payment URL');
        window.location.href = d.url;
        return;
      }

      if (chosen === 'paysera') {
        const apiBase = CONFIG.API_BASE;
        const d = await post<{ url: string }>(`${apiBase}/api/checkout/paysera`, {
          planKey,
          planName: plan.name,
          productKind: plan.product,
          email: session?.email ?? null,
          leadId: session?.leadId ?? null,
          paymentMethod: payseraMethod,
        });
        if (!d?.url) throw new Error('No payment URL');
        window.location.href = d.url;
        return;
      }

      // Stripe element: confirmPayment handled by Stripe SDK
      // (the onSubmit of the Stripe element takes care of redirect to success URL)
      // This branch only fires if user clicks Pay when mode=element; the
      // SDK handles it. We just signal to confirm:
      const stripeEl = document.querySelector<HTMLElement>('[data-stripe-confirm]');
      if (stripeEl) stripeEl.click();
    } catch (ex) {
      console.error('[checkout] pay failed:', ex);
      setPayError("We couldn't start the payment. Please try again, or choose the other payment method.");
    } finally {
      setPaying(false);
    }
  };

  const chooseMethod = (m: PayMethod) => {
    setChosen(m);
    setPayError('');
    mergeAssessment({ method: m });
  };

  if (!ready) return null;

  /* No valid session */
  if (!eligible) {
    return (
      <>
        <Navbar />
        <main>
          <div className="pv-quiz-shell">
            <div className="th-co-nosession">
              <h2>Session not found</h2>
              <p>Please complete the eligibility assessment first to choose a plan.</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/hrt-eligibility" className="btn-secondary">HRT assessment</Link>
                <Link href="/glp1-eligibility" className="btn-primary">GLP-1 assessment</Link>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  const medName =
    plan!.product === 'GLP1' && session?.med && CONFIG.MEDICATIONS[session.med]
      ? CONFIG.MEDICATIONS[session.med]
      : null;

  const eligUrl = plan!.product === 'HRT' ? '/hrt-eligibility' : '/glp1-eligibility';

  const btnLabel = paying
    ? 'Redirecting to secure payment…'
    : chosen
    ? `Pay with ${chosen === 'stripe' ? 'Stripe' : 'Paysera'} · ${plan!.price}${plan!.per}`
    : 'Select a payment method';

  return (
    <>
      <Navbar />
      <main>
        <div className="pv-page-head">
          <div className="container">
            <div className="pv-page-head-tag">Secure Checkout</div>
            <h1 className="pv-page-head-h1">Complete your order</h1>
          </div>
        </div>

        <div style={{ maxWidth: 520, margin: '40px auto 80px', padding: '0 var(--px)' }}>
          {/* Order summary */}
          <div className="th-co-card" style={{ marginBottom: 20 }}>
            <div className="th-co-sum-label">Your plan</div>
            <div className="th-co-sum-name">{plan!.name}</div>
            <div className="th-co-sum-desc">
              {plan!.desc}
              {medName ? ` · Preferred medicine: ${medName} (your doctor confirms the final prescription)` : ''}
            </div>
            <div className="th-co-sum-price">{plan!.price}<small>{plan!.per}</small></div>
            <div className="th-co-divider" />
            <Link href={`${eligUrl}?resume=1`} style={{ fontSize: 13, color: 'var(--c-blue)', fontWeight: 600 }}>
              ← Change plan
            </Link>
          </div>

          {/* Payment methods */}
          <div className="th-co-card">
            <div className="th-co-section-label">Payment method</div>

            {/* Paysera (Kosovo) */}
            <button
              type="button"
              className="th-co-method"
              data-th-method="paysera"
              role="radio"
              aria-checked={chosen === 'paysera'}
              onClick={() => chooseMethod('paysera')}
              style={{
                borderColor: chosen === 'paysera' ? '#1E4FD8' : undefined,
                background: chosen === 'paysera' ? '#EEF4FF' : undefined,
                borderBottomLeftRadius: chosen === 'paysera' ? 0 : undefined,
                borderBottomRightRadius: chosen === 'paysera' ? 0 : undefined,
              }}
            >
              <div
                className="th-method-dot"
                style={{ border: chosen === 'paysera' ? '7px solid #1E4FD8' : undefined }}
              />
              <div>
                <div className="th-co-method-label">Pay with Paysera</div>
                <div className="th-co-method-desc">Bank transfer &amp; local payment methods</div>
              </div>
            </button>
            {chosen === 'paysera' && (
              <div className="th-co-panel">
                <PayseraMount
                  planKey={planKey!}
                  savedMethod={session?.payseraMethod}
                  onReady={(mode) => setPayseraMode(mode)}
                  onSelect={(key) => setPayseraMethod(key)}
                />
              </div>
            )}

            {/* Stripe */}
            <button
              type="button"
              className="th-co-method"
              data-th-method="stripe"
              role="radio"
              aria-checked={chosen === 'stripe'}
              onClick={() => chooseMethod('stripe')}
              style={{
                borderColor: chosen === 'stripe' ? '#1E4FD8' : undefined,
                background: chosen === 'stripe' ? '#EEF4FF' : undefined,
                borderBottomLeftRadius: chosen === 'stripe' ? 0 : undefined,
                borderBottomRightRadius: chosen === 'stripe' ? 0 : undefined,
              }}
            >
              <div
                className="th-method-dot"
                style={{ border: chosen === 'stripe' ? '7px solid #1E4FD8' : undefined }}
              />
              <div>
                <div className="th-co-method-label">Pay by card</div>
                <div className="th-co-method-desc">Visa, Mastercard &amp; more — powered by Stripe</div>
              </div>
            </button>
            {chosen === 'stripe' && (
              <div className="th-co-panel">
                <StripeMount
                  priceId={plan!.priceId}
                  planName={plan!.name}
                  email={session?.email}
                  leadId={session?.leadId}
                  onReady={(mode) => setStripeMode(mode)}
                  onComplete={(complete) => setStripeComplete(complete)}
                />
              </div>
            )}

            <button
              className="th-co-pay-btn"
              aria-disabled={!canPay() || paying ? 'true' : undefined}
              aria-busy={paying ? 'true' : undefined}
              onClick={handlePay}
            >
              {btnLabel}
            </button>
            {payError && <div className="th-co-pay-error">{payError}</div>}
            <p className="th-co-secure">
              Payments are processed securely by Paysera and Stripe. We never see or store your card details.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutInner />
    </Suspense>
  );
}
