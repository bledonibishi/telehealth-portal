'use client';

import { BILLING_COPY, type BillingChoice as Choice } from '@/lib/billing-choice';
import type { TreatmentPrices } from '@/lib/dose-prices';

/** Pay once, or subscribe for less. Without a price of its own for the dose, only what is known is shown. */
export default function BillingChoice({ value, onChange, prices, name }: { value: Choice; onChange: (v: Choice) => void; prices: TreatmentPrices | null; name: string }) {
  const canSubscribe = !prices || prices.subscription != null;
  return (
    <div className="th-billing" role="radiogroup" aria-label="How you pay">
      {canSubscribe && (
        <label className={`th-billing-opt sub${value === 'SUBSCRIPTION' ? ' on' : ''}`}>
          <input type="radio" name={name} checked={value === 'SUBSCRIPTION'} onChange={() => onChange('SUBSCRIPTION')} />
          <span className="th-billing-body">
            <span className="th-billing-head">
              <strong>Subscribe <em className="th-billing-badge">{BILLING_COPY.subscribeBadge}</em></strong>
              {prices?.subscription && <span className="th-billing-price">{prices.subscription}<small> / month</small></span>}
            </span>
            <small>{BILLING_COPY.subscriptionPrice}</small>
          </span>
        </label>
      )}
      <label className={`th-billing-opt${value === 'ONE_TIME' ? ' on' : ''}`}>
        <input type="radio" name={name} checked={value === 'ONE_TIME'} onChange={() => onChange('ONE_TIME')} />
        <span className="th-billing-body">
          <span className="th-billing-head"><strong>Pay once</strong>{prices && <span className="th-billing-price">{prices.once}</span>}</span>
          <small>{BILLING_COPY.oncePrice}</small>
        </span>
      </label>
    </div>
  );
}
