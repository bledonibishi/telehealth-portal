'use client';

import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="pv-nav">
      <div className="pv-nav-inner">
        <Link href="/" className="pv-logo">
          Primavera <span>Health</span>
        </Link>

        <div className="pv-nav-links">
          <Link href="/#treatments">Treatments</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#bmi">BMI Check</Link>
          <Link href="/#contact">Contact</Link>
        </div>

        <div className="pv-nav-cta">
          <Link href="/hrt-eligibility" className="pv-nav-btn outline">
            Start HRT
          </Link>
          <Link href="/trt-eligibility" className="pv-nav-btn outline">
            Start TRT
          </Link>
          <Link href="/glp1-eligibility" className="pv-nav-btn solid">
            Start GLP-1
          </Link>
        </div>
      </div>
    </nav>
  );
}
