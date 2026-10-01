'use client';

import { useEffect, useState } from 'react';

// Local dev/testing only. Stands in for the real Webflow quiz + checkout page
// so the referral/voucher system can be clicked through in a browser without
// a live Webflow site. Not linked from anywhere real — reach it directly at
// http://localhost:3001/test-checkout?ref=SOMECODE
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

const box: React.CSSProperties = { border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16, maxWidth: 480 };
const input: React.CSSProperties = { display: 'block', width: '100%', padding: 8, marginTop: 4, marginBottom: 10, boxSizing: 'border-box' };
const button: React.CSSProperties = { padding: '8px 16px', marginRight: 8, cursor: 'pointer' };

type Plan = { key: string; name: string; desc: string; priceLabel: string; priceId: string | null };

export default function TestCheckoutPage() {
  const [email, setEmail] = useState('friend@example.com');
  const [firstName, setFirstName] = useState('Fiona');
  const [lastName, setLastName] = useState('Friend');
  const [referralCode, setReferralCode] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planKey, setPlanKey] = useState('');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [discountApplied, setDiscountApplied] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) setReferralCode(ref);

    fetch(`${BACKEND_URL}/internal/dev/plans`)
      .then((r) => r.json())
      .then((data: Plan[]) => {
        setPlans(data);
        const firstConfigured = data.find((p) => p.priceId);
        if (firstConfigured) setPlanKey(firstConfigured.key);
      })
      .catch(() => {});
  }, []);

  const selectedPlan = plans.find((p) => p.key === planKey) ?? null;
  const currencySymbol = selectedPlan?.priceLabel.match(/^[^\d]+/)?.[0] ?? '£';
  const planAmount = selectedPlan ? parseFloat(selectedPlan.priceLabel.replace(/[^0-9.]/g, '')) : 0;
  const discountedAmount = Math.max(0, planAmount - 20);

  const append = (line: string) => setLog((l) => [...l, line]);

  function selectPlan(key: string) {
    setPlanKey(key);
    setDiscountApplied(false);
  }

  async function createLead() {
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'mutation($input:CreateLeadInput!){createLead(input:$input){id email}}',
          variables: {
            input: {
              email,
              firstName,
              lastName,
              productKind: 'HRT',
              quizAnswers: [{ questionId: 'test', question: 'Test question?', answer: 'Yes' }],
              referralCode: referralCode || null,
            },
          },
        }),
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      setLeadId(json.data.createLead.id);
      append(`✅ Lead created: ${json.data.createLead.id}${referralCode ? ` (referral code: ${referralCode})` : ''}`);
    } catch (err: any) {
      append(`❌ createLead failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function payWithStripe() {
    if (!leadId || !selectedPlan?.priceId) return;
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: selectedPlan.priceId, planName: selectedPlan.name, leadId, applyReward: discountApplied }),
      });
      const json = await res.json();
      if (!json.url) throw new Error(json.message || 'No checkout URL returned');
      append(`➡️ Redirecting to Stripe Checkout (test mode) for ${selectedPlan.name} (${selectedPlan.priceLabel})…`);
      window.location.href = json.url;
    } catch (err: any) {
      append(`❌ Stripe checkout failed: ${err.message}`);
      setBusy(false);
    }
  }

  async function simulatePaysera() {
    if (!leadId) return;
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND_URL}/internal/dev/simulate-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Simulation failed');
      append(`✅ Simulated a successful Paysera payment for ${email} — patient activation + referral reward logic just ran for real.`);
      append(`   Check the referrer's Rewards page in the patient portal, or the backend console for the "[DEV] Activation email" log.`);
    } catch (err: any) {
      append(`❌ Simulation failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <h1>Test checkout (local dev only)</h1>
      <p style={{ color: '#666' }}>
        Stands in for the Webflow quiz + checkout page. Backend: <code>{BACKEND_URL}</code>
      </p>

      <div style={box}>
        <h3>1. Friend's details</h3>
        <label>
          Email
          <input style={input} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          First name
          <input style={input} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label>
          Last name
          <input style={input} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label>
          Referral code (from <code>?ref=</code>, or paste one)
          <input style={input} value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="e.g. 7B9F2C2ABA" />
        </label>
        <button style={button} disabled={busy} onClick={createLead}>
          Create test lead
        </button>
        {leadId && <span style={{ color: 'green' }}>Lead ready: {leadId}</span>}
      </div>

      {leadId && (
        <div style={box}>
          <h3>2. Pay</h3>
          <label>
            Plan
            <select style={input} value={planKey} onChange={(e) => selectPlan(e.target.value)}>
              <option value="">Choose a plan…</option>
              {plans.map((p) => (
                <option key={p.key} value={p.key} disabled={!p.priceId}>
                  {p.name} — {p.priceLabel} ({p.desc}){!p.priceId ? ' — no price id set in .env' : ''}
                </option>
              ))}
            </select>
          </label>

          {selectedPlan && (
            <div style={{ background: '#f7f7f7', borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 14 }}>
              <div>
                <strong>{selectedPlan.name}</strong> —{' '}
                {discountApplied ? (
                  <>
                    <span style={{ textDecoration: 'line-through', color: '#999' }}>{selectedPlan.priceLabel}</span>{' '}
                    <strong style={{ color: '#0a7d2c' }}>
                      {currencySymbol}
                      {discountedAmount.toFixed(2)}
                    </strong>
                  </>
                ) : (
                  selectedPlan.priceLabel
                )}
              </div>

              {referralCode ? (
                discountApplied ? (
                  <div style={{ color: '#0a7d2c' }}>✅ $20 referral discount applied</div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: '#0a7d2c' }}>🎁 $20 referral discount available</span>
                    <button style={{ padding: '4px 10px', cursor: 'pointer' }} onClick={() => setDiscountApplied(true)}>
                      Apply
                    </button>
                  </div>
                )
              ) : (
                <div style={{ color: '#999' }}>No referral code attached — full price</div>
              )}

              <p style={{ color: '#999', fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                This is just a preview — the real discount is attached automatically server-side regardless of this button, and you'll see it again
                as a line item on Stripe's own checkout page.
              </p>
            </div>
          )}

          <button style={button} disabled={busy || !selectedPlan?.priceId} onClick={payWithStripe}>
            Pay with Stripe (real test-mode checkout)
          </button>
          <button style={button} disabled={busy} onClick={simulatePaysera}>
            Simulate Paysera payment (mock — no real processor)
          </button>
        </div>
      )}

      <div style={box}>
        <h3>Log</h3>
        {log.length === 0 ? <p style={{ color: '#999' }}>Nothing yet.</p> : log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
