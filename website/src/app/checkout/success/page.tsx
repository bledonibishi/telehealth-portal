import Link from 'next/link';
import Navbar from '@/components/Navbar';

export const metadata = {
  title: 'Order Confirmed – Primavera Healthcare',
  description: 'Your assessment has been submitted. A doctor will review it shortly.',
};

export default function CheckoutSuccessPage() {
  return (
    <>
      <Navbar />
      <main className="pv-result-page">
        <div className="pv-result-card">
          <div className="pv-result-icon success">✓</div>
          <h1 className="pv-result-h1">You're all set!</h1>
          <p className="pv-result-sub">
            Your payment was successful and your assessment has been submitted.
            Please check your email — we'll be in touch shortly.
          </p>

          <div className="pv-result-steps">
            <div className="pv-result-step">
              <div className="pv-result-step-num">1</div>
              <span>A licensed doctor will review your assessment within 24 hours.</span>
            </div>
            <div className="pv-result-step">
              <div className="pv-result-step-num">2</div>
              <span>If approved, your prescription will be sent to a registered pharmacy.</span>
            </div>
            <div className="pv-result-step">
              <div className="pv-result-step-num">3</div>
              <span>Your medication will be dispatched with free delivery to your address.</span>
            </div>
          </div>

          <Link href="/" className="btn-primary" style={{ justifyContent: 'center', width: '100%' }}>
            Return to homepage
          </Link>
        </div>
      </main>
    </>
  );
}
