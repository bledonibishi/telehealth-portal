import Link from 'next/link';
import { CONFIG } from '@/lib/config';
import { DICT, LEGAL_PATHS, anchor, homePath, type Lang } from '@/lib/i18n';
import { treatmentsFor } from '@/lib/treatments';

/** The footer of every public page, in the page's language. */
export default function SiteFooter({ lang = 'en', switchHref }: { lang?: Lang; switchHref?: string }) {
  const t = DICT[lang].footer;
  const legal = LEGAL_PATHS[lang];
  const other: Lang = lang === 'sq' ? 'en' : 'sq';
  return (
    <footer className="pv-footer">
      <div className="pv-footer-inner">
        <div>
          <div className="pv-footer-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/omo-logo.png?v=3" alt="" width={42} height={42} />
            <span>Omo <span>Pharmacy</span></span>
          </div>
          <p className="pv-footer-tagline">{t.tagline}</p>
        </div>
        <div>
          <div className="pv-footer-col-title">{t.treatments}</div>
          <div className="pv-footer-links">
            {treatmentsFor(lang).map((x) => (
              <Link key={x.key} href={x.href}>{x.abbr} – {x.full}</Link>
            ))}
          </div>
        </div>
        <div>
          <div className="pv-footer-col-title">{t.company}</div>
          <div className="pv-footer-links">
            <Link href={anchor(lang, 'how-it-works')}>{t.how}</Link>
            <Link href={anchor(lang, 'contact')}>{t.contact}</Link>
            <a href={`mailto:${CONFIG.CONTACT.email}`}>{t.emailUs}</a>
            <Link href={switchHref ?? homePath(other)} lang={other} hrefLang={other}>{DICT[lang].nav.switchTo}</Link>
          </div>
        </div>
      </div>
      <div className="pv-footer-bottom">
        <span style={{ color: 'rgba(255,255,255,.4)' }}>
          © {new Date().getFullYear()} Omo Pharmacy. {t.rights}
        </span>
        <div className="pv-footer-legal">
          <Link href={legal.privacy}>{t.privacy}</Link>
          <Link href={legal.terms}>{t.terms}</Link>
          <Link href={legal.cookies}>{t.cookies}</Link>
        </div>
      </div>
    </footer>
  );
}
