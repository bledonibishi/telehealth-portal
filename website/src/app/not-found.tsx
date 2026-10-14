import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="pv-result-page">
        <div className="pv-result-card">
          <h1 className="pv-result-h1">We couldn’t find that page</h1>
          <p className="pv-result-sub">
            The link may be old or mistyped. Start from the home page, or go straight to an assessment.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            <Link href="/" className="btn-primary" style={{ justifyContent: 'center' }}>
              Go to the home page
            </Link>
            <Link href="/#treatments" className="btn-secondary" style={{ justifyContent: 'center' }}>
              See our treatments
            </Link>
          </div>

          <p style={{ marginTop: 20, fontSize: 13, color: 'var(--c-muted)' }}>
            Need help?{' '}
            <a href="/#contact" style={{ color: 'var(--c-brand)', fontWeight: 600 }}>
              Contact us
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
