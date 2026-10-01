'use client';

import { useEffect, useRef, useState, useCallback, Suspense, type MutableRefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { CONFIG, type PlanKey } from '@/lib/config';
import { loadAssessment, mergeAssessment } from '@/lib/storage';
import { STORE_PRODUCTS } from '@/lib/catalog';

/* ── Types ── */
type PayMethod = 'stripe' | 'paysera';
interface PayseraMethod { key: string; title: string; logo?: string; group?: string }

type Amounts = { amountDueCents: number | null; discountCents: number; currency: string | null };
interface BillingDetails {
  name: string;
  email: string;
  address: { line1: string; line2: string; city: string; state: string; postal_code: string; country: string };
}
type ConfirmFn = (billing: BillingDetails) => Promise<{ error?: { message?: string } }>;
interface Shipping { name: string; line1: string; city: string; postalCode: string; country: string }
interface Reward { title: string; description: string; amountOffCents: number | null; percentOff: number | null; currency: string | null }

const COUNTRIES: Array<[string, string]> = [
  ['XK', 'Kosovo'], ['AL', 'Albania'], ['MK', 'North Macedonia'], ['ME', 'Montenegro'], ['RS', 'Serbia'],
  ['DE', 'Germany'], ['AT', 'Austria'], ['CH', 'Switzerland'], ['GB', 'United Kingdom'], ['IE', 'Ireland'],
];

const money = (cents: number, currency: string | null) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency ?? 'gbp').toUpperCase() }).format(cents / 100);

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
  priceId, planName, leadId, product, dose, applyReward, addProgesterone, confirmRef, onReady, onComplete, onAmounts,
}: {
  priceId: string; planName: string; leadId?: string | null;
  product?: string | null; dose?: string | null; applyReward: boolean; addProgesterone: boolean;
  confirmRef: MutableRefObject<ConfirmFn | null>;
  onReady: (mode: 'element' | 'redirect') => void;
  onComplete: (complete: boolean) => void;
  onAmounts: (a: Amounts) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const peRef = useRef<unknown>(null);

  useEffect(() => {
    if (!ref.current) return;
    const mount = ref.current;
    // A response that arrives after this form was replaced (reward toggled) or
    // unmounted must not publish its payment or callbacks over the new form's.
    let cancelled = false;
    let confirmFn: ConfirmFn | null = null;

    if (!CONFIG.STRIPE_PUBLISHABLE_KEY) {
      mount.innerHTML = '<p class="pv-panel-note">You will enter your card details on Stripe\'s secure checkout page in the next step.</p>';
      onReady('redirect');
      return () => { cancelled = true; };
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
      post<{ clientSecret: string; intentType?: string } & Partial<Amounts>>(
        `${apiBase}/api/checkout/stripe-intent`,
        { priceId, planName, leadId: leadId ?? null, product: product ?? null, dose: dose ?? null, addProgesterone, applyReward },
      ),
    ])
      .then(([, d]) => {
        if (cancelled) return;
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
          // Name, email and address come from our own form (passed at confirm time).
          fields: { billingDetails: { name: 'never', email: 'never', address: 'never' } },
        });
        (peRef as { current: unknown }).current = pe;
        confirmFn = (billing) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (stripe as any).confirmPayment({
            elements,
            confirmParams: {
              return_url: `${window.location.origin}/checkout/success`,
              payment_method_data: { billing_details: billing },
            },
          });
        confirmRef.current = confirmFn;
        onAmounts({ amountDueCents: d.amountDueCents ?? null, discountCents: d.discountCents ?? 0, currency: d.currency ?? null });
        mount.innerHTML = '';
        pe.mount(mount);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pe.on('change', (ev: any) => onComplete(ev.complete));
        onReady('element');
      })
      .catch((ex) => {
        if (cancelled) return;
        console.warn('[checkout] Stripe inline unavailable:', ex);
        mount.innerHTML = '<p class="pv-panel-note">You will enter your card details on Stripe\'s secure checkout page in the next step.</p>';
        onReady('redirect');
      });

    return () => {
      cancelled = true;
      if (confirmFn && confirmRef.current === confirmFn) confirmRef.current = null;
      mount.innerHTML = '';
    };
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
  const started = useRef(false);

  useEffect(() => {
    const box = ref.current;
    if (!box || started.current) return;
    started.current = true;
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


const parseAmount = (label: string) => parseFloat(label.replace(/[^0-9.]/g, '')) || 0;

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
  const [amounts, setAmounts] = useState<Amounts | null>(null);
  const confirmRef = useRef<ConfirmFn | null>(null);

  const [shipping, setShipping] = useState<Shipping>({ name: '', line1: '', city: '', postalCode: '', country: 'XK' });
  const [touched, setTouched] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [rewardApplied, setRewardApplied] = useState(false);

  useEffect(() => {
    const s = loadAssessment();
    const key = (planKeyParam ?? s?.plan ?? null) as PlanKey | null;
    setSession(s);
    setPlanKey(key);
    setReady(true);
    if (key) mergeAssessment({ plan: key });
    setChosen((s?.method as PayMethod | undefined) ?? 'stripe');
    if (s?.payseraMethod) setPayseraMethod(s.payseraMethod);
    const fullName = [s?.firstName, s?.lastName].filter(Boolean).join(' ');
    if (fullName) setShipping((v) => ({ ...v, name: fullName }));

    if (s?.leadId) {
      fetch(`${CONFIG.API_BASE}/api/checkout/rewards?leadId=${encodeURIComponent(s.leadId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { referralReward: Reward | null } | null) => setReward(d?.referralReward ?? null))
        .catch(() => {});
    }
  }, [planKeyParam]);

  const plan = planKey ? CONFIG.PLANS[planKey] : null;
  // A payment without a saved lead would never get a patient account created.
  const eligible = !!session?.passed && !!session?.leadId && !!plan && plan.product === session?.product;
  // A plan with no display price or Stripe price configured can't be ordered.
  const planAvailable = !!plan && /\d/.test(plan.price) && !plan.priceId.startsWith('price_REPLACE');
  const shippingValid = !!(shipping.name.trim() && shipping.line1.trim() && shipping.city.trim() && shipping.postalCode.trim());

  const canPay = useCallback(() => {
    if (!shippingValid || !planAvailable) return false;
    if (chosen === 'stripe') return stripeMode === 'redirect' || (stripeMode === 'element' && stripeComplete);
    if (chosen === 'paysera') return payseraMode === 'redirect' || (payseraMode === 'list' && !!payseraMethod);
    return false;
  }, [shippingValid, planAvailable, chosen, stripeMode, stripeComplete, payseraMode, payseraMethod]);

  const toggleReward = () => {
    // The card form is created with (or without) the reward, so it restarts.
    setRewardApplied((v) => !v);
    setStripeComplete(false);
    setStripeMode(null);
    setAmounts(null);
    setPayError('');
  };

  const handlePay = async () => {
    if (!plan || !planKey) return;
    if (!planAvailable) {
      setPayError("This plan isn't available to order yet.");
      return;
    }
    if (!shippingValid) {
      setTouched(true);
      setPayError('Please fill in your name and delivery address.');
      return;
    }
    if (!canPay()) return;
    setPayError('');
    setPaying(true);

    const shippingBody = {
      name: shipping.name.trim(),
      line1: shipping.line1.trim(),
      city: shipping.city.trim(),
      postalCode: shipping.postalCode.trim(),
      country: shipping.country,
    };

    try {
      if (chosen === 'stripe' && stripeMode === 'redirect') {
        const d = await post<{ url: string }>(`${CONFIG.API_BASE}/api/checkout`, {
          priceId: plan.priceId,
          planName: plan.name,
          leadId: session?.leadId ?? null,
          email: session?.email ?? null,
          product: session?.productName ?? null,
          dose: session?.dose ?? null,
          addProgesterone: session?.addProgesterone ?? false,
          applyReward: rewardApplied,
          shipping: shippingBody,
        });
        if (!d?.url) throw new Error('No payment URL');
        window.location.href = d.url;
        return;
      }

      if (chosen === 'paysera') {
        const d = await post<{ url: string }>(`${CONFIG.API_BASE}/api/checkout/paysera`, {
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

      // Inline Stripe Element: save the delivery details, then confirm. Stripe
      // redirects to /checkout/success on success and only comes back with an error.
      await post(`${CONFIG.API_BASE}/api/checkout/details`, {
        leadId: session?.leadId ?? null,
        shipping: shippingBody,
      });
      const result = await confirmRef.current?.({
        name: shippingBody.name,
        email: session?.email ?? '',
        // Stripe requires every address field once its own address inputs are hidden.
        address: { line1: shippingBody.line1, line2: '', city: shippingBody.city, state: '', postal_code: shippingBody.postalCode, country: shippingBody.country },
      });
      if (result?.error) setPayError(result.error.message ?? 'Your payment could not be completed.');
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
                <Link href="/trt-eligibility" className="btn-secondary">TRT assessment</Link>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  const eligUrl = plan!.product === 'HRT' ? '/hrt-eligibility' : plan!.product === 'TRT' ? '/trt-eligibility' : '/glp1-eligibility';
  const storeProduct = STORE_PRODUCTS.find((p) => p.slug === session?.productSlug);
  const medName =
    plan!.product === 'GLP1' && !storeProduct && session?.med && CONFIG.MEDICATIONS[session.med] ? CONFIG.MEDICATIONS[session.med] : null;

  const currencySymbol = (planAvailable && plan!.price.match(/^[^\d]+/)?.[0]) || '£';
  const planAmount = parseAmount(plan!.price);
  const rewardOff = reward?.amountOffCents != null ? reward.amountOffCents / 100 : reward?.percentOff != null ? (planAmount * reward.percentOff) / 100 : 0;
  const rewardLabel =
    reward?.amountOffCents != null ? money(reward.amountOffCents, reward.currency) : reward?.percentOff != null ? `${reward.percentOff}%` : '';
  // Stripe's own total once the card form has created the payment; otherwise an
  // estimate, and never a made-up £0.00 when the display price isn't configured.
  const dueToday =
    amounts?.amountDueCents != null
      ? money(amounts.amountDueCents, amounts.currency)
      : planAvailable
      ? `${currencySymbol}${Math.max(0, planAmount - (rewardApplied ? rewardOff : 0)).toFixed(2)}`
      : '—';

  const btnLabel = paying
    ? 'Processing…'
    : chosen
    ? `Pay ${dueToday}${plan!.per} with ${chosen === 'stripe' ? 'card' : 'Paysera'}`
    : 'Select a payment method';

  const setField = (k: keyof Shipping) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setShipping((v) => ({ ...v, [k]: e.target.value }));
  const invalid = (v: string) => touched && !v.trim();

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

        <div className="th-co-grid">
          <div className="th-co-main">
            {/* Delivery details */}
            <div className="th-co-card">
              <div className="th-co-section-label">Delivery details</div>
              <div className="th-co-fields">
                <div className="th-co-field full">
                  <label htmlFor="co-name">Full name</label>
                  <input id="co-name" autoComplete="name" value={shipping.name} onChange={setField('name')} aria-invalid={invalid(shipping.name)} />
                </div>
                <div className="th-co-field full">
                  <label htmlFor="co-line1">Street address</label>
                  <input id="co-line1" autoComplete="address-line1" value={shipping.line1} onChange={setField('line1')} aria-invalid={invalid(shipping.line1)} />
                </div>
                <div className="th-co-field">
                  <label htmlFor="co-city">City</label>
                  <input id="co-city" autoComplete="address-level2" value={shipping.city} onChange={setField('city')} aria-invalid={invalid(shipping.city)} />
                </div>
                <div className="th-co-field">
                  <label htmlFor="co-zip">ZIP / postal code</label>
                  <input id="co-zip" autoComplete="postal-code" value={shipping.postalCode} onChange={setField('postalCode')} aria-invalid={invalid(shipping.postalCode)} />
                </div>
                <div className="th-co-field full">
                  <label htmlFor="co-country">Country</label>
                  <select id="co-country" autoComplete="country" value={shipping.country} onChange={setField('country')}>
                    {COUNTRIES.map(([code, name]) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Payment methods */}
            <div className="th-co-card">
              <div className="th-co-section-label">Payment method</div>

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
                <div className="th-method-dot" style={{ border: chosen === 'paysera' ? '7px solid #1E4FD8' : undefined }} />
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
                <div className="th-method-dot" style={{ border: chosen === 'stripe' ? '7px solid #1E4FD8' : undefined }} />
                <div>
                  <div className="th-co-method-label">Pay by card</div>
                  <div className="th-co-method-desc">Visa, Mastercard &amp; more — powered by Stripe</div>
                </div>
              </button>
              {chosen === 'stripe' && (
                <div className="th-co-panel">
                  <StripeMount
                    key={rewardApplied ? 'reward' : 'full'}
                    priceId={plan!.priceId}
                    planName={plan!.name}
                    leadId={session?.leadId}
                    product={session?.productName}
                    dose={session?.dose}
                    applyReward={rewardApplied}
                    addProgesterone={session?.addProgesterone ?? false}
                    confirmRef={confirmRef}
                    onReady={(mode) => setStripeMode(mode)}
                    onComplete={(complete) => setStripeComplete(complete)}
                    onAmounts={setAmounts}
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
              <p className="th-co-secure">Payments are processed securely by Paysera and Stripe. We never see or store your card details.</p>
            </div>
          </div>

          {/* Order summary + rewards */}
          <aside className="th-co-side">
            <div className="th-co-card">
              <div className="th-co-section-label">Your order</div>
              {storeProduct && (
                <div
                  className="th-co-sum-img"
                  style={{ backgroundImage: `url(${CONFIG.IMAGES[storeProduct.image]})` }}
                  role="img"
                  aria-label={storeProduct.brand}
                />
              )}
              {session?.productName && (
                <div className="th-co-sum-product">
                  {session.productName}
                  {storeProduct ? <span> · {storeProduct.generic}</span> : null}
                </div>
              )}
              {(session?.dose || session?.addProgesterone) && (
                <div className="th-co-sum-chips">
                  {session?.dose && <span className="th-co-chip">{session.dose}</span>}
                  {session?.addProgesterone && <span className="th-co-chip">+ Progesterone</span>}
                </div>
              )}
              <div className="th-co-sum-name">{plan!.name}</div>
              <div className="th-co-sum-desc">
                {plan!.desc}
                {medName ? ` · Preferred medicine: ${medName} (your doctor confirms the final prescription)` : ''}
              </div>
              <div className="th-co-divider" />
              <div className="th-co-row"><span>{plan!.name} · billed monthly</span><span>{plan!.price}</span></div>
              {rewardApplied && reward && (
                <div className="th-co-row reward"><span>Referral reward</span><span>−{rewardLabel}</span></div>
              )}
              <div className="th-co-row total"><span>Due today</span><span>{dueToday}</span></div>
              <p className="th-co-note">Your doctor reviews your assessment first. If they can&apos;t prescribe, you&apos;re refunded.</p>
              <div className="th-co-divider" />
              <Link href={`${eligUrl}?resume=1`} style={{ fontSize: 13, color: 'var(--c-blue)', fontWeight: 600 }}>
                ← Change plan
              </Link>
            </div>

            {reward && (
              <div className={`th-co-card th-reward${rewardApplied ? ' applied' : ''}`}>
                <div className="th-reward-icon">🎁</div>
                <div className="th-reward-body">
                  <div className="th-reward-title">{rewardLabel} off your first order</div>
                  <div className="th-reward-desc">{reward.title} · {reward.description}</div>
                </div>
                <button type="button" className={`th-reward-btn${rewardApplied ? ' remove' : ''}`} onClick={toggleReward}>
                  {rewardApplied ? 'Remove' : 'Apply'}
                </button>
              </div>
            )}
          </aside>
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
