import Link from 'next/link';
import { DICT, anchor, type Lang } from '@/lib/i18n';
import SiteFooter from '@/components/SiteFooter';
import BmiWidget from '@/components/BmiWidget';
import Navbar from '@/components/Navbar';
import HeroChooser from '@/components/HeroChooser';
import ScrollReveal from '@/components/ScrollReveal';
import { CONFIG } from '@/lib/config';

const FEATURE_ICONS = [
  (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
        <path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/>
        <circle cx="20" cy="10" r="2"/>
      </svg>
  ),
  (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
        <path d="M15 18H9"/>
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
        <circle cx="17" cy="18" r="2"/>
        <circle cx="7" cy="18" r="2"/>
      </svg>
  ),
  (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
  ),
  (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
  ),
];

/** "email", "email or phone", "email, phone or WhatsApp": only the ways of reaching us that are set. */
const contactChannels = (lang: Lang) => {
  const c = DICT[lang].contact.channels;
  return c.join([c.email, ...(CONFIG.CONTACT.phones.length ? [c.phone] : []), ...(CONFIG.CONTACT.whatsapp ? [c.whatsapp] : [])]);
};

export default function HomeView({ lang }: { lang: Lang }) {
  const t = DICT[lang];
  return (
    <>
      <Navbar lang={lang} />
      <main>

        {/* ── HERO ── */}
        <section className="pv-hero">
          <div className="pv-hero-inner">
            <div className="pv-hero-copy pv-anim">
              <div className="pv-chip">
                <span className="pv-chip-dot" />
                {t.hero.chip}
              </div>
              <h1 className="pv-hero-h1">
                {t.hero.h1a}<br />
                <em>{t.hero.h1b}</em>
              </h1>
              <p className="pv-hero-sub">
                {t.hero.sub}
              </p>
              <div className="pv-hero-ctas">
                <HeroChooser lang={lang} />
                <Link href={anchor(lang, 'how-it-works')} className="btn-secondary">
                  {t.hero.how}
                </Link>
              </div>
              <div className="pv-hero-trust">
                <span>{t.hero.trust[0]}</span>
                <span className="pv-hero-trust-dot" />
                <span>{t.hero.trust[1]}</span>
                <span className="pv-hero-trust-dot" />
                <span>{t.hero.trust[2]}</span>
              </div>
            </div>

            <div className="pv-hero-visual pv-anim">
              <div className="pv-hero-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CONFIG.IMAGES.hero} alt="" loading="eager" />
              </div>
              <div className="pv-float-a">
                <div className="pv-float-a-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <div>
                  <div className="pv-float-big pv-float-text">{t.hero.floatTitle}</div>
                  <div className="pv-float-label">{t.hero.floatLabel}</div>
                </div>
              </div>
              <div className="pv-float-b">
                <div className="pv-float-b-badge">{t.hero.newBadge}</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-dark)' }}>
                  {t.hero.newText}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURES BAR ── */}
        <section className="pv-features section-sm">
          <div className="pv-features-inner">
            {t.features.map(([title, desc], i) => (
              <div key={title} className="pv-feature pv-anim">
                <div className="pv-feature-icon">{FEATURE_ICONS[i]}</div>
                <div>
                  <div className="pv-feature-title">{title}</div>
                  <div className="pv-feature-desc">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── TREATMENTS ── */}
        <section className="section" id="treatments">
          <div className="container">
            <div className="th-section-head pv-anim">
              <div className="th-section-tag">{t.treatmentsSection.tag}</div>
              <h2 className="th-section-h2">{t.treatmentsSection.h2}</h2>
              <p className="th-section-lead">{t.treatmentsSection.lead}</p>
            </div>
          </div>
          <div className="th-products-grid">
            {/* HRT Card */}
            <div className="th-product-card-hrt pv-anim">
              <div
                className="th-product-img"
                style={{ backgroundImage: `url(${CONFIG.IMAGES['p-hrt-starter']})` }}
              >
                <div className="th-product-badge">{t.treatmentsSection.cards.hrt.badge}</div>
              </div>
              <div className="th-product-body">
                <span className="th-product-tag">HRT</span>
                <h3 className="th-product-name">{t.treatmentsSection.cards.hrt.name}</h3>
                <p className="th-product-desc">{t.treatmentsSection.cards.hrt.desc}</p>
                <div className="th-product-cta">
                  <Link href="/hrt-eligibility" className="btn-primary btn-sm">
                    {t.treatmentsSection.check}
                  </Link>
                </div>
              </div>
            </div>

            {/* GLP-1 Card */}
            <div className="th-product-card-glp pv-anim">
              <div
                className="th-product-img"
                style={{ backgroundImage: `url(${CONFIG.IMAGES['p-wegovy']})` }}
              >
                <div className="th-product-badge">{t.treatmentsSection.cards.glp.badge}</div>
              </div>
              <div className="th-product-body">
                <span className="th-product-tag">GLP-1</span>
                <h3 className="th-product-name">{t.treatmentsSection.cards.glp.name}</h3>
                <p className="th-product-desc">{t.treatmentsSection.cards.glp.desc}</p>
                <div className="th-product-cta">
                  <Link href="/glp1-eligibility" className="btn-primary btn-sm">
                    {t.treatmentsSection.check}
                  </Link>
                </div>
              </div>
            </div>

            {/* TRT Card */}
            <div className="th-product-card-hrt pv-anim">
              <div
                className="th-product-img"
                style={{ backgroundImage: `url(${CONFIG.IMAGES['p-trt']})` }}
              >
                <div className="th-product-badge">{t.treatmentsSection.cards.trt.badge}</div>
              </div>
              <div className="th-product-body">
                <span className="th-product-tag">TRT</span>
                <h3 className="th-product-name">{t.treatmentsSection.cards.trt.name}</h3>
                <p className="th-product-desc">{t.treatmentsSection.cards.trt.desc}</p>
                <div className="th-product-cta">
                  <Link href="/trt-eligibility" className="btn-primary btn-sm">
                    {t.treatmentsSection.check}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="section" id="how-it-works" style={{ background: 'var(--c-sand)' }}>
          <div className="container">
            <div className="th-section-head pv-anim">
              <div className="th-section-tag">{t.how.tag}</div>
              <h2 className="th-section-h2">{t.how.h2}</h2>
              <p className="th-section-lead">{t.how.lead}</p>
            </div>
          </div>
          <div className="th-steps-grid">
            {t.how.steps.map(([title, desc], i) => (
              <div key={title} className="th-step-card pv-anim">
                <div className="th-step-num">{i + 1}</div>
                <div className="th-step-title">{title}</div>
                <div className="th-step-desc">{desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── BMI CALCULATOR ── */}
        <section className="section" id="bmi">
          <div className="pv-bmi-shell pv-anim">
            <div className="pv-bmi-inner">
              <div className="pv-bmi-copy">
                <div className="pv-bmi-tag">{t.bmi.tag}</div>
                <h2 className="pv-bmi-h2">{t.bmi.h2}</h2>
                <p className="pv-bmi-sub">{t.bmi.sub}</p>
                <div className="pv-bmi-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={CONFIG.IMAGES.bmi} alt="" loading="lazy" />
                </div>
              </div>
              <div className="pv-bmi-widget">
                <BmiWidget lang={lang} />
              </div>
            </div>
          </div>
        </section>

        {/* ── CONTACT ── */}
        <section className="section" id="contact">
          <div className="container" style={{ padding: 0 }}>
            <div className="pv-contact-section">
              <div
                className="pv-contact-photo-wrap pv-anim"
                style={{ backgroundImage: `url(${CONFIG.IMAGES.contact})` }}
              />
              <div className="pv-info-card pv-anim">
                <div className="pv-info-card-tag">{t.contact.tag}</div>
                <h3 className="pv-info-card-h3">{t.contact.h3}</h3>
                <p className="pv-info-card-desc">{t.contact.desc(contactChannels(lang))}</p>
                <div>
                  <div className="pv-contact-row">
                    {t.contact.email}:{' '}
                    <a className="pv-info-link" href={`mailto:${CONFIG.CONTACT.email}`}>
                      {CONFIG.CONTACT.email}
                    </a>
                  </div>
                  {CONFIG.CONTACT.phones.map((p) => (
                    <div key={p.number} className="pv-contact-row">
                      {p.label}:{' '}
                      <a className="pv-info-link" href={`tel:${p.number.replace(/[^\d+]/g, '')}`}>
                        {p.number}
                      </a>
                    </div>
                  ))}
                  {CONFIG.CONTACT.whatsapp && (
                    <a
                      className="pv-wa-btn"
                      href={`https://wa.me/${CONFIG.CONTACT.whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
                      </svg>
                      {t.contact.whatsappButton}
                    </a>
                  )}
                </div>
                <p className="pv-info-note">{t.contact.note}</p>
              </div>
            </div>
          </div>
        </section>

      </main>

      <SiteFooter lang={lang} />

      <ScrollReveal />
    </>
  );
}
