'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { money, shopApi } from '@/lib/shop';

/**
 * Stands in for the bank's payment page while trying the shop locally (the backend's DEV payment provider, offered
 * only when no real provider is set up and never in production). No money moves.
 */
function TestPayment() {
  const params = useSearchParams();
  const paymentId = params.get('payment') ?? '';
  const amount = Number(params.get('amount') ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Shown inside the checkout like the bank's form: without the shop's own header and footer.
  useEffect(() => {
    if (window.self !== window.top) document.documentElement.classList.add('in-frame');
  }, []);

  const finish = async (outcome: 'success' | 'fail' | 'cancel') => {
    setBusy(true);
    try {
      await shopApi.completeTestPayment(paymentId, outcome);
      const back = params.get(outcome === 'success' ? 'success' : outcome === 'fail' ? 'fail' : 'cancel');
      if (back) window.location.assign(back);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The test payment failed');
      setBusy(false);
    }
  };

  return (
    <>
      <main className="pv-result-page">
        <div className="pv-result-card">
          <div className="pv-result-icon">🧪</div>
          <h1 className="pv-result-h1">Test payment</h1>
          <p className="pv-result-sub">For local testing only. No money moves. Choose what the bank would answer for {money(amount, params.get('currency') ?? 'eur')}.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            <button type="button" className="btn-primary" style={{ justifyContent: 'center' }} disabled={busy} onClick={() => finish('success')}>Approve the payment</button>
            <button type="button" className="btn-secondary" style={{ justifyContent: 'center' }} disabled={busy} onClick={() => finish('fail')}>Decline (not enough money)</button>
            <button type="button" className="btn-secondary" style={{ justifyContent: 'center' }} disabled={busy} onClick={() => finish('cancel')}>Cancel</button>
          </div>
          {error && <div className="th-co-pay-error" role="alert">{error}</div>}
        </div>
      </main>
    </>
  );
}

export default function TestPaymentPage() {
  return (
    <Suspense>
      <TestPayment />
    </Suspense>
  );
}
