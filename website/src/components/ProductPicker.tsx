'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONFIG, type ProductKind } from '@/lib/config';
import { PROGESTERONE_NOTE, planKeyFor, productsFor, type StoreProduct } from '@/lib/catalog';
import { loadAssessment, mergeAssessment } from '@/lib/storage';

function ProductCard({ product, preselected }: { product: StoreProduct; preselected: boolean }) {
  const router = useRouter();
  const [doseIdx, setDoseIdx] = useState(0);
  const [progesterone, setProgesterone] = useState(false);

  const dose = product.doses[doseIdx];
  const planKey = planKeyFor(product, dose, progesterone);
  const plan = CONFIG.PLANS[planKey];

  const handleContinue = () => {
    mergeAssessment({
      plan: planKey,
      productSlug: product.slug,
      productName: product.brand,
      dose: dose.label,
      addProgesterone: progesterone,
    });
    router.push('/checkout?plan=' + encodeURIComponent(planKey));
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

        {product.progesteroneAddOn && (
          <label className="th-prod-addon">
            <input type="checkbox" checked={progesterone} onChange={(e) => setProgesterone(e.target.checked)} />
            <span>
              <strong>Add progesterone</strong>
              <small>{PROGESTERONE_NOTE}</small>
            </span>
          </label>
        )}

        <div className="th-prod-foot">
          <div>
            <div className="th-plan-price">
              {plan.price}
              <small>{plan.per}</small>
            </div>
            <div className="th-prod-tier">{plan.name}</div>
          </div>
          <button type="button" className="th-prod-cta" onClick={handleContinue}>
            Continue →
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
          style={{ background: 'none', border: 'none', color: 'var(--c-blue)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          ← Restart assessment
        </button>
      </p>
    </div>
  );
}
