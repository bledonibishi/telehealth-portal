'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { CONFIG } from '@/lib/config';
import { PROGESTERONE_NOTE, STORE_PRODUCTS, planKeyFor } from '@/lib/catalog';
import { useTreatmentPrice } from '@/lib/dose-prices';
import { loadAssessment, mergeAssessment, type Assessment } from '@/lib/storage';

interface Reward { title: string; description: string; amountOffCents: number | null; percentOff: number | null; currency: string | null }

const money = (cents: number, currency: string | null) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency ?? 'gbp').toUpperCase() }).format(cents / 100);

/**
 * The step between choosing a treatment and paying: change the dose, add progesterone, and apply or remove
 * the referral reward. The card form on the next page is created once with these choices, so nothing the
 * buyer types there is lost to a change made afterwards.
 */
function ReviewInner() {
  const router = useRouter();
  const [session, setSession] = useState<Assessment | null>(null);
  const [ready, setReady] = useState(false);
  const [doseIdx, setDoseIdx] = useState(0);
  const [progesterone, setProgesterone] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [rewardApplied, setRewardApplied] = useState(false);

  const product = STORE_PRODUCTS.find((p) => p.slug === session?.productSlug);

  useEffect(() => {
    const s = loadAssessment();
    setSession(s);
    const p = STORE_PRODUCTS.find((x) => x.slug === s?.productSlug);
    if (p) {
      const i = p.doses.findIndex((d) => d.label === s?.dose);
      setDoseIdx(i >= 0 ? i : 0);
      setProgesterone(!!p.progesteroneAddOn && !!s?.addProgesterone);
    }
    setReady(true);

    if (s?.leadId) {
      fetch(`${CONFIG.API_BASE}/api/checkout/rewards?leadId=${encodeURIComponent(s.leadId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { referralReward: Reward | null } | null) => {
          const offered = d?.referralReward ?? null;
          setReward(offered);
          // Never applied for them: it is on only if the buyer has chosen to apply it.
          if (offered) setRewardApplied(s.applyReward ?? false);
        })
        .catch(() => {});
    }
  }, []);

  const dose = product?.doses[doseIdx];
  const planKey = product && dose ? planKeyFor(product, dose, progesterone) : null;
  const plan = planKey ? CONFIG.PLANS[planKey] : null;
  const dosePrice = useTreatmentPrice(product?.brand, dose?.label, progesterone);
  const price = dosePrice ?? plan?.price;
  const available = !!plan && (!!dosePrice || (/\d/.test(plan.price) && !plan.priceId.startsWith('price_REPLACE')));
  const rewardLabel =
    reward?.amountOffCents != null ? money(reward.amountOffCents, reward.currency) : reward?.percentOff != null ? `${reward.percentOff}%` : '';

  if (!ready) return null;

  if (!session?.passed || !session.leadId || !product || !dose || !plan || !planKey) {
    return (
      <>
        <Navbar />
        <main>
          <div className="pv-quiz-shell">
            <div className="th-co-nosession">
              <h2>Session not found</h2>
              <p>Please complete the eligibility assessment first to choose a treatment.</p>
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

  const choose = (nextIdx: number, nextProgesterone: boolean) => {
    const nextDose = product.doses[nextIdx];
    setDoseIdx(nextIdx);
    setProgesterone(nextProgesterone);
    mergeAssessment({
      plan: planKeyFor(product, nextDose, nextProgesterone),
      productSlug: product.slug,
      productName: product.brand,
      dose: nextDose.label,
      addProgesterone: nextProgesterone,
    });
  };

  const toggleReward = () => {
    setRewardApplied((v) => {
      mergeAssessment({ applyReward: !v });
      return !v;
    });
  };

  const handleContinue = () => {
    if (!available) return;
    mergeAssessment({ plan: planKey, applyReward: !!reward && rewardApplied });
    router.push('/health-questions');
  };

  const eligUrl = product.kind === 'HRT' ? '/hrt-eligibility' : product.kind === 'TRT' ? '/trt-eligibility' : '/glp1-eligibility';

  return (
    <>
      <Navbar />
      <main>
        <div className="pv-page-head">
          <div className="container">
            <div className="pv-page-head-tag">Your order</div>
            <h1 className="pv-page-head-h1">Review your treatment</h1>
          </div>
        </div>

        <div className="th-co-grid">
          <div className="th-co-main">
            <div className="th-co-card">
              <div className="th-co-section-label">Treatment</div>
              <div className="th-co-sum-img" style={{ backgroundImage: `url(${CONFIG.IMAGES[product.image]})` }} role="img" aria-label={product.brand} />
              <div className="th-co-sum-product">
                {product.brand}
                <span> · {product.generic}</span>
              </div>
              <p className="th-prod-blurb">{product.blurb}</p>

              <div className="th-prod-label">{product.doses.length > 1 ? 'Choose your dose' : 'Strength'}</div>
              <div className="th-dose-row" role="radiogroup" aria-label={`${product.brand} dose`}>
                {product.doses.map((d, i) => (
                  <button
                    key={d.label}
                    type="button"
                    role="radio"
                    aria-checked={i === doseIdx}
                    className={`th-dose-chip${i === doseIdx ? ' on' : ''}`}
                    onClick={() => choose(i, progesterone)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {dose.pack && <div className="th-prod-pack">{dose.pack}</div>}

              {product.progesteroneAddOn && (
                <label className="th-prod-addon">
                  <input type="checkbox" checked={progesterone} onChange={(e) => choose(doseIdx, e.target.checked)} />
                  <span>
                    <strong>Add progesterone</strong>
                    <small>{PROGESTERONE_NOTE}</small>
                  </span>
                </label>
              )}

              <p style={{ marginTop: 20 }}>
                <Link href={`${eligUrl}?resume=1`} style={{ fontSize: 13, color: 'var(--c-blue)', fontWeight: 600 }}>
                  ← Choose a different treatment
                </Link>
              </p>
            </div>
          </div>

          <aside className="th-co-side">
            <div className="th-co-card">
              <div className="th-co-section-label">Summary</div>
              <div className="th-co-row">
                <span>
                  {dosePrice ? `${product.brand} ${dose.label}${progesterone ? ' + progesterone' : ''}` : plan.name} · billed monthly
                </span>
                <span>{available ? price : 'Coming soon'}</span>
              </div>
              {reward && rewardApplied && (
                <div className="th-co-row reward"><span>Referral reward</span><span>−{rewardLabel}</span></div>
              )}
              <p className="th-co-note">You&apos;ll see the exact total at checkout. Your doctor reviews your assessment first; if they can&apos;t prescribe, you&apos;re refunded.</p>
              <button
                type="button"
                className="th-co-pay-btn"
                onClick={handleContinue}
                disabled={!available}
                style={available ? undefined : { opacity: 0.45, cursor: 'not-allowed' }}
              >
                {available ? 'Continue to health questions →' : 'Unavailable'}
              </button>
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

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewInner />
    </Suspense>
  );
}
