'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONFIG, type ProductKind } from '@/lib/config';
import { PROGESTERONE_NOTE, planKeyFor, productsFor, type StoreProduct } from '@/lib/catalog';
import { loadAssessment, mergeAssessment } from '@/lib/storage';
import { formatFee, usePrescriptionFee, useTreatmentPrices } from '@/lib/dose-prices';
import { DEFAULT_BILLING, type BillingChoice as Choice } from '@/lib/billing-choice';
import BillingChoice from './BillingChoice';

function ProductCard({ product, preselected }: { product: StoreProduct; preselected: boolean }) {
  const router = useRouter();
  const [doseIdx, setDoseIdx] = useState(0);
  const [progesterone, setProgesterone] = useState(false);
  const [billing, setBilling] = useState<Choice>(DEFAULT_BILLING);

  const dose = product.doses[doseIdx];
  const planKey = planKeyFor(product, dose, progesterone);
  const plan = CONFIG.PLANS[planKey];
  // Each dose is charged at its own price, plus the progesterone's when that is ticked; anything
  // without a price of its own is charged at its plan's.
  const fee = usePrescriptionFee();
  const prices = useTreatmentPrices(product.brand, dose.label, progesterone);
  const dosePrice = prices?.once ?? null;
  // A subscription costs less; a dose without a subscription price can only be paid once.
  const subscribing = billing === 'SUBSCRIPTION' && (!prices || prices.subscription != null);
  const price = (subscribing ? prices?.subscription : dosePrice) ?? plan.price;
  // A dose with no price of its own, and a plan with no display price or no Stripe price configured, can't be ordered yet.
  const available = !!dosePrice || (/\d/.test(plan.price) && !plan.priceId.startsWith('price_REPLACE'));

  const handleContinue = () => {
    if (!available) return;
    mergeAssessment({
      plan: planKey,
      productSlug: product.slug,
      productName: product.brand,
      dose: dose.label,
      addProgesterone: progesterone,
      billing: subscribing ? 'SUBSCRIPTION' : 'ONE_TIME',
    });
    router.push('/review?plan=' + encodeURIComponent(planKey));
  };

  return (
    <div className={`th-prod-card${preselected ? ' featured' : ''}`}>
      <div
        className="th-prod-img"
        style={{ backgroundImage: `url(${CONFIG.IMAGES[product.image]})` }}
        role="img"
        aria-label={product.brand}
      />
      <div className="th-prod-body">
        {preselected && <div className="th-plan-badge green">Your choice</div>}
        <div className="th-prod-brand">{product.brand}</div>
        <div className="th-prod-generic">
          {product.generic} · {product.format}
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
              onClick={() => setDoseIdx(i)}
            >
              {d.label}
            </button>
          ))}
        </div>
        {dose.pack && <div className="th-prod-pack">{dose.pack}</div>}

        {product.progesteroneAddOn && <div className="th-prod-label th-prod-section">Add-on</div>}
        {product.progesteroneAddOn && (
          <>
            <div className="th-dose-row">
              <button type="button" role="checkbox" aria-checked={progesterone} className={`th-dose-chip${progesterone ? ' on' : ''}`} onClick={() => setProgesterone(!progesterone)}>
                {progesterone ? '✓ ' : '+ '}Add progesterone
              </button>
            </div>
            <div className="th-prod-pack">{PROGESTERONE_NOTE}</div>
          </>
        )}

        {dosePrice && <div className="th-prod-label th-prod-section th-prod-split">How would you like to pay?</div>}
        {dosePrice && <BillingChoice value={subscribing ? 'SUBSCRIPTION' : 'ONE_TIME'} onChange={setBilling} prices={prices} name={`billing-${product.slug}`} />}

        <div className="th-prod-foot">
          <div>
            <div className="th-plan-price">
              {available ? (
                <>
                  {price}
                  <small>{subscribing ? ' / month' : ' once'}</small>
                </>
              ) : (
                'Coming soon'
              )}
            </div>
            {fee && available && <div className="th-prod-tier">+ {formatFee(fee)} prescription fee</div>}
            <div className="th-prod-tier">{dosePrice ? `${product.brand} ${dose.label}${progesterone ? ' + progesterone' : ''}` : plan.name}</div>
          </div>
          <button type="button" className="th-prod-cta" onClick={handleContinue} disabled={!available} style={available ? undefined : { opacity: 0.45, cursor: 'not-allowed' }}>
            {available ? 'Continue →' : 'Unavailable'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductPicker({ product, onRestart }: { product: ProductKind; onRestart: () => void }) {
  const products = productsFor(product);
  const med = loadAssessment()?.med;

  return (
    <div className="th-picker">
      <div className="th-plans-head">
        <h2 className="th-plans-h2">Choose your treatment</h2>
        <p className="th-plans-sub">
          Pick a product and dose. Your doctor reviews your assessment and confirms the final prescription. Free delivery to Kosovo.
        </p>
      </div>
      <div className="th-prod-grid">
        {products.map((p) => (
          <ProductCard key={p.slug} product={p} preselected={!!med && p.medKey === med} />
        ))}
      </div>
      <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--c-muted)' }}>
        <button
          onClick={onRestart}
          style={{ background: 'none', border: 'none', color: 'var(--c-brand)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          ← Restart assessment
        </button>
      </p>
    </div>
  );
}
