'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { loadAssessment } from '@/lib/storage';

export default function CheckoutCancelPage() {
  const [resumeHref, setResumeHref] = useState<string | null>(null);

  useEffect(() => {
    const s = loadAssessment();
    if (s?.passed) {
      const href = s.plan
        ? `/checkout?plan=${encodeURIComponent(s.plan)}`
        : s.product === 'HRT'
        ? '/hrt-eligibility?resume=1'
        : '/glp1-eligibility?resume=1';
      setResumeHref(href);
    }
  }, []);

  return (
    <>
      <Navbar />
      <main className="pv-result-page">
        <div className="pv-result-card">
          <div className="pv-result-icon cancel">✕</div>
          <h1 className="pv-result-h1">Payment cancelled</h1>
          <p className="pv-result-sub">
            No charge was made. Your assessment results are saved — you can continue
            where you left off whenever you're ready.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            {resumeHref && (
              <Link href={resumeHref} className="btn-primary" style={{ justifyContent: 'center' }}>
                Continue to checkout →
              </Link>
            )}
            <Link href="/" className="btn-secondary" style={{ justifyContent: 'center' }}>
              Return to homepage
            </Link>
          </div>

          <p style={{ marginTop: 20, fontSize: 13, color: 'var(--c-muted)' }}>
            Need help?{' '}
            <a href="/#contact" style={{ color: 'var(--c-blue)', fontWeight: 600 }}>
              Contact us
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
