'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { treatmentsFor } from '@/lib/treatments';
import { DICT, anchor, homePath, type Lang } from '@/lib/i18n';
import PortalLink from '@/components/PortalLink';

export default function Navbar({ lang = 'en', switchHref }: { lang?: Lang; switchHref?: string }) {
  const pathname = usePathname();
  const t = DICT[lang];
  const other: Lang = lang === 'sq' ? 'en' : 'sq';

  return (
    <nav className="pv-nav">
      <div className="pv-nav-inner">
        <div className="pv-nav-brand">
          <Link href={homePath(lang)} className="pv-logo">
            <img src="/omo-logo.png?v=3" alt="" width={42} height={42} />
            <span className="pv-logo-text">Omo Pharmacy</span>
          </Link>
          {/* The shop is its own place: entering it plays the portal transition (components/PortalTransition). */}
          <PortalLink href="/shop" theme="shop" className="pv-shop-btn" aria-label={t.nav.shopLabel}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 7h12l-1 13H7L6 7Z" />
              <path d="M9 7a3 3 0 0 1 6 0" />
            </svg>
            <span>{t.nav.shop}</span>
          </PortalLink>
        </div>

        <div className="pv-nav-links">
          <Link href={anchor(lang, 'treatments')}>{t.nav.treatments}</Link>
          <Link href={anchor(lang, 'how-it-works')}>{t.nav.how}</Link>
          <Link href={anchor(lang, 'bmi')}>{t.nav.bmi}</Link>
          <Link href={anchor(lang, 'contact')}>{t.nav.contact}</Link>
        </div>

        <Link href={switchHref ?? homePath(other)} lang={other} hrefLang={other} className="pv-lang pv-lang-top" aria-label={other === 'sq' ? 'Shqip' : 'English'}>
          {t.nav.switchTo}
        </Link>

        <div className="pv-nav-cta">
          {treatmentsFor(lang).map((t) => {
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
