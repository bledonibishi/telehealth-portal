'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TREATMENTS } from '@/lib/treatments';

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="pv-nav">
      <div className="pv-nav-inner">
        <Link href="/" className="pv-logo">
          <img src="/omo-logo.png?v=3" alt="" width={42} height={42} />
          <span className="pv-logo-text">Omo Pharmacy</span>
        </Link>

        <div className="pv-nav-links">
          <Link href="/#treatments">Treatments</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#bmi">BMI Check</Link>
          <Link href="/#contact">Contact</Link>
        </div>

        <div className="pv-nav-cta">
          {TREATMENTS.map((t) => {
            const active = pathname?.startsWith(t.href) ?? false;
            return (
              <Link
                key={t.key}
                href={t.href}
                className={`pv-treat pv-treat--${t.key}${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                aria-label={`${t.name} (${t.abbr}) – ${t.full}`}
              >
                <span className="pv-treat-ico">{t.icon}</span>
                <span className="pv-treat-text">
                  <span className="pv-treat-name">
                    <span className="pv-treat-long">{t.name} </span>
                    <span className="pv-treat-abbr">
                      <span className="pv-treat-long">(</span>
                      {t.abbr}
                      <span className="pv-treat-long">)</span>
                    </span>
                  </span>
                  <span className="pv-treat-sub">
                    <span className="pv-treat-long">{t.full}</span>
                    <span className="pv-treat-short">{t.short}</span>
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
