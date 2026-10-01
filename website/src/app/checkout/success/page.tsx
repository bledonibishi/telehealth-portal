'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { CONFIG } from '@/lib/config';
import { loadAssessment } from '@/lib/storage';

interface SuccessInfo {
  ready: boolean;
  firstName?: string;
  email?: string;
  referralLink?: string;
}

const POLL_MS = 2000;
const MAX_POLLS = 8;

function SuccessInner() {
  const params = useSearchParams();
  const sessionId = params.get('session_id');
  const paymentIntent = params.get('payment_intent');
  const failed = params.get('redirect_status') === 'failed';

  const [info, setInfo] = useState<SuccessInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [storedEmail, setStoredEmail] = useState<string | undefined>();

  useEffect(() => setStoredEmail(loadAssessment()?.email), []);

  useEffect(() => {
    if (failed || (!sessionId && !paymentIntent)) return;
    let cancelled = false;
    const qs = sessionId
      ? `session_id=${encodeURIComponent(sessionId)}`
      : `payment_intent=${encodeURIComponent(paymentIntent!)}`;

    // The account is created by Stripe's webhook, which can land a moment
    // after the redirect — so ask a few times before giving up.
    const poll = async (attempt: number) => {
      try {
        const res = await fetch(`${CONFIG.API_BASE}/api/checkout/success-info?${qs}`);
        if (!res.ok) return;
        const data = (await res.json()) as SuccessInfo;
        if (cancelled) return;
        setInfo(data);
        if (!data.ready && attempt < MAX_POLLS) setTimeout(() => poll(attempt + 1), POLL_MS);
      } catch {
        /* the page still works without the personalised parts */
      }
    };
    poll(1);
    return () => {
      cancelled = true;
    };
  }, [sessionId, paymentIntent, failed]);

  const copy = async () => {
    if (!info?.referralLink) return;
    try {
      await navigator.clipboard.writeText(info.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is selectable in the field */
    }
  };

  if (failed) {
    return (
      <main className="pv-result-page">
        <div className="pv-result-card">
          <div className="pv-result-icon cancel">✕</div>
          <h1 className="pv-result-h1">Payment didn&apos;t go through</h1>
          <p className="pv-result-sub">Your card wasn&apos;t charged. You can go back and try again, or pick another payment method.</p>
          <Link href="/checkout" className="btn-primary" style={{ justifyContent: 'center', width: '100%' }}>
            Back to checkout
          </Link>
        </div>
      </main>
    );
  }

  const email = info?.email ?? storedEmail;
  const portalUrl = `${CONFIG.PORTAL_URL}/get-started${email ? `?email=${encodeURIComponent(email)}` : ''}`;
  const hasStores = Boolean(CONFIG.APP_STORE_URL || CONFIG.PLAY_STORE_URL);

  return (
    <main>
      <div className="th-success">
        <div className="th-success-hero">
          <div className="pv-result-icon success">✓</div>
          <h1 className="pv-result-h1">You&apos;re all set{info?.firstName ? `, ${info.firstName}` : ''}!</h1>
          <p className="pv-result-sub" style={{ marginBottom: 0 }}>
            Your payment was successful. Set up your account to complete your medical questionnaire and ID check, so a doctor can review your assessment.
          </p>
        </div>

        <div className="th-success-card highlight">
          <h2>Next: set up your account</h2>
          <p>
            Enter your email in the patient app and we&apos;ll send you a link to choose your password
            {email ? <> (we&apos;ll use <strong>{email}</strong>)</> : null}.
          </p>
          <a href={portalUrl} className="btn-primary" style={{ justifyContent: 'center', width: '100%' }}>
            Set up my account →
          </a>
        </div>

        <div className="th-success-card">
          <h2>Give $20, get $20</h2>
          <p>Share your link. When a friend joins, they get $20 off their first order and you get $20 off your next one.</p>
          {info?.referralLink ? (
            <div className="th-ref-row">
              <input className="th-ref-input" readOnly value={info.referralLink} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn-primary" onClick={copy}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, color: 'var(--c-muted)' }}>
              {info === null || !info.ready
                ? 'Your personal link will appear here in a moment — you can also find it in the app under Refer & earn.'
                : ''}
            </p>
          )}
        </div>

        <div className="th-success-card">
          <h2>What happens next</h2>
          <div className="pv-result-steps" style={{ marginBottom: 0 }}>
            <div className="pv-result-step">
              <div className="pv-result-step-num">1</div>
              <span>Set your password, then complete your medical questionnaire and ID check in the app.</span>
            </div>
            <div className="pv-result-step">
              <div className="pv-result-step-num">2</div>
              <span>A licensed doctor reviews your assessment within 24 hours.</span>
            </div>
            <div className="pv-result-step">
              <div className="pv-result-step-num">3</div>
              <span>If approved, your prescription goes to a registered pharmacy and is dispatched with free delivery.</span>
            </div>
          </div>
        </div>

        <div className="th-success-card">
          <h2>Your treatment, in your pocket</h2>
          <p>Track your doses, log your progress and message your clinical team any time.</p>
          {hasStores && (
            <div className="th-store-row" style={{ marginBottom: 16 }}>
              {CONFIG.APP_STORE_URL && (
                <a className="th-store-btn" href={CONFIG.APP_STORE_URL} target="_blank" rel="noreferrer">
                  <span><small>Download on the</small>App Store</span>
                </a>
              )}
              {CONFIG.PLAY_STORE_URL && (
                <a className="th-store-btn" href={CONFIG.PLAY_STORE_URL} target="_blank" rel="noreferrer">
                  <span><small>Get it on</small>Google Play</span>
                </a>
              )}
            </div>
          )}
          <div className="th-success-tips">
            <div className="th-success-tip"><strong>Dose reminders</strong>Never miss a dose.</div>
            <div className="th-success-tip"><strong>Progress tracking</strong>Log weight and symptoms.</div>
            <div className="th-success-tip"><strong>Secure messages</strong>Talk to your clinician.</div>
            <div className="th-success-tip"><strong>Order tracking</strong>Follow your delivery.</div>
          </div>
        </div>

        <Link href="/" style={{ textAlign: 'center', fontSize: 14, color: 'var(--c-muted)' }}>
          Return to homepage
        </Link>
      </div>
    </main>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <>
      <Navbar />
      <Suspense>
        <SuccessInner />
      </Suspense>
    </>
  );
}
