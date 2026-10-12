'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const TREATMENTS = [
  {
    key: 'hrt',
    href: '/hrt-eligibility',
    name: 'Women’s hormones',
    abbr: 'HRT',
    full: 'Hormone replacement therapy',
    short: 'Women',
    icon: (
      <svg {...ICON}>
        <circle cx="12" cy="9" r="5" />
        <path d="M12 14v7M9 18h6" />
      </svg>
    ),
  },
  {
    key: 'trt',
    href: '/trt-eligibility',
    name: 'Men’s hormones',
    abbr: 'TRT',
    full: 'Testosterone replacement therapy',
    short: 'Men',
    icon: (
      <svg {...ICON}>
        <circle cx="10" cy="14" r="5" />
        <path d="M19 5l-5.4 5.4M14 5h5v5" />
      </svg>
    ),
  },
  {
    key: 'glp',
    href: '/glp1-eligibility',
    name: 'Weight loss',
    abbr: 'GLP-1',
    full: 'Medical weight management',
    short: 'Weight',
    icon: (
      <svg {...ICON} stroke="url(#pv-glp-grad)" strokeWidth={2.4}>
        <defs>
          <linearGradient id="pv-glp-grad" gradientUnits="userSpaceOnUse" x1="2" y1="7" x2="22" y2="17">
            <stop offset="0" stopColor="#E5484D" />
            <stop offset=".5" stopColor="#F5A524" />
            <stop offset="1" stopColor="#12A150" />
          </linearGradient>
        </defs>
        <path d="M2 7l6.5 6.5 5-5L22 17" />
        <path d="M16 17h6v-6" />
      </svg>
    ),
  },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="pv-nav">
      <div className="pv-nav-inner">
        <Link href="/" className="pv-logo">
          <img src="/omo-logo.png?v=2" alt="" width={34} height={34} />
          <span className="pv-logo-text">
            Omo <span>Pharmacy</span>
          </span>
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
