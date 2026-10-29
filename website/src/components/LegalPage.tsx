import { Fragment } from 'react';
import Navbar from '@/components/Navbar';
import SiteFooter from '@/components/SiteFooter';
import ConsentReset from '@/components/ConsentReset';
import HtmlLang from '@/components/HtmlLang';
import { LEGAL, LEGAL_REVIEWED } from '@/lib/legal';
import { LEGAL_PATHS, type Lang } from '@/lib/i18n';

/** Text with [[placeholders]] shown highlighted, so what is still to be filled in cannot be missed. */
function Marked({ text }: { text: string }) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('[[') ? <span key={i} className="pv-legal-ph">{part.slice(2, -2)}</span> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

export default function LegalPage({ lang, doc }: { lang: Lang; doc: 'privacy' | 'terms' | 'cookies' }) {
  const pack = LEGAL[lang];
  const d = pack[doc];
  // The language switch opens this same document in the other language, not the other home page.
  const switchHref = LEGAL_PATHS[lang === 'sq' ? 'en' : 'sq'][doc];
  return (
    <>
      {lang === 'sq' && <HtmlLang lang="sq" />}
      <Navbar lang={lang} switchHref={switchHref} />
      <main className="pv-legal">
        <h1>{d.title}</h1>
        <p className="pv-legal-updated">{pack.updatedLabel}: <Marked text={pack.updated} /></p>
        {!LEGAL_REVIEWED && <div className="pv-legal-draft" role="note">{pack.draft}</div>}
        {d.intro && <p>{d.intro}</p>}
        {d.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p?.map((p, i) => <p key={`p${i}`}><Marked text={p} /></p>)}
            {s.ul && <ul>{s.ul.map((li, i) => <li key={i}><Marked text={li} /></li>)}</ul>}
          </section>
        ))}
        {doc === 'cookies' && <p style={{ marginTop: 24 }}><ConsentReset label={pack.cookieSettings} /></p>}
      </main>
      <SiteFooter lang={lang} switchHref={switchHref} />
    </>
  );
}
