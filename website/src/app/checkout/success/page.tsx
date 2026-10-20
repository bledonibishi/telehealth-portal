'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { CONFIG } from '@/lib/config';
import { loadAssessment } from '@/lib/storage';
import { clearReferralCode } from '@/lib/referral';

interface SuccessInfo {
  ready: boolean;
  firstName?: string;
  email?: string;
  referralLink?: string;
  /** The referral reward as the backend pays it, e.g. "€20.00". */
  referralRewardLabel?: string;
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

  // The friend's link did its job with this order; it must not attach to the next quiz started in this browser.
  useEffect(() => {
    if (!failed && (sessionId || paymentIntent)) clearReferralCode();
  }, [failed, sessionId, paymentIntent]);

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
  // Shown in the currency the backend actually pays it in ("€20.00" → "€20"); until that is known, no amount is promised.
  const reward = info?.referralRewardLabel?.replace(/[.,]00$/, '');

  return (
    <main>
      <div className="th-success">
        <div className="th-success-hero">
          <div className="pv-result-icon success">✓</div>
          <h1 className="pv-result-h1">You&apos;re all set{info?.firstName ? `, ${info.firstName}` : ''}!</h1>
          <p className="pv-result-sub" style={{ marginBottom: 0 }}>
            Your payment went through and your answers are saved. A few last steps in the app, then a doctor reviews everything.
          </p>
        </div>

        <div className="th-success-card highlight">
          <h2>Next: check your email</h2>
          <p>
            {info?.ready ? 'A link to choose your password is on its way to ' : 'We’re setting up your account. A link to choose your password will arrive at '}
            {email ? <strong>{email}</strong> : 'the address you gave us'}
            {info?.ready ? '.' : ' in a minute or two.'} Open it, then add what the doctor still needs: usually your date of
            birth and address, a photo of your ID and a full-body photo (and proof of your current treatment, if you&apos;re
            already on one). The app shows exactly what&apos;s left.
          </p>
          <p style={{ margin: 0, fontSize: 14 }}>
            No email after a few minutes? Check your spam folder, or{' '}
            <a href={portalUrl} style={{ color: 'var(--c-brand)', fontWeight: 600 }}>
              send the link again
            </a>
            .
          </p>
        </div>

        <div className="th-success-card referral">
          {reward ? (
            <h2>Give <span className="th-price">{reward}</span>, get <span className="th-price">{reward}</span></h2>
          ) : (
            <h2>Give a discount, get a discount</h2>
          )}
          <p>
            Share your link. When a friend joins, they get {reward ? <span className="th-price">{reward}</span> : 'a discount'} off
            their first order and you get {reward ? <span className="th-price">{reward}</span> : 'the same'} off your next one.
          </p>
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
              <span>Set your password from the email, then add your ID and photos in the app. Your health answers come with you; the app asks only for anything still missing.</span>
            </div>
            <div className="pv-result-step">
              <div className="pv-result-step-num">2</div>
              <span>A licensed doctor reviews your assessment within 24 hours of your last step.</span>
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
