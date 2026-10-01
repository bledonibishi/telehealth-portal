import Link from 'next/link';
import BmiWidget from '@/components/BmiWidget';
import Navbar from '@/components/Navbar';
import ScrollReveal from '@/components/ScrollReveal';
import { CONFIG } from '@/lib/config';

const FEATURES = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
        <path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/>
        <circle cx="20" cy="10" r="2"/>
      </svg>
    ),
    title: 'Licensed clinicians',
    desc: 'Every assessment reviewed by a practising, registered doctor in Kosovo.',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
        <path d="M15 18H9"/>
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
        <circle cx="17" cy="18" r="2"/>
        <circle cx="7" cy="18" r="2"/>
      </svg>
    ),
    title: 'Free delivery',
    desc: 'Prescription medications delivered directly to your door, free of charge.',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
    ),
    title: 'Regulated medications',
    desc: 'We only dispense branded, licensed medications — never unlicensed compounded products.',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    title: 'Secure & confidential',
    desc: 'End-to-end encryption. Your health data is never sold or shared with third parties.',
  },
];

const STEPS = [
  {
    num: '1',
    title: 'Complete the eligibility quiz',
    desc: 'Answer a few simple questions about your health. Takes about 2 minutes. No account needed.',
  },
  {
    num: '2',
    title: 'A doctor reviews your assessment',
    desc: 'A licensed clinician checks your answers and approves your prescription within 24 hours.',
  },
  {
    num: '3',
    title: 'Medication delivered to you',
    desc: 'Your prescription is dispensed by a registered pharmacy and delivered directly to your address.',
  },
];

const STATS = [
  { num: '2,000+', label: 'Patients treated' },
  { num: '98%', label: 'Patient satisfaction' },
  { num: '24h', label: 'Average prescription time' },
  { num: '5★', label: 'Average trust rating' },
];

const TRUST = [
  {
    title: 'Licensed, practising clinicians',
    desc: 'Every prescription is authorised by a qualified, registered doctor — not an algorithm.',
  },
  {
    title: 'Regulated, branded medications',
    desc: 'Estradiol, progesterone, and semaglutide — all from licensed, recognised manufacturers.',
  },
  {
    title: 'End-to-end data security',
    desc: 'Your health information is encrypted and handled under strict GDPR principles.',
  },
];

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>

        {/* ── HERO ── */}
        <section className="pv-hero">
          <div className="pv-hero-inner">
            <div className="pv-hero-copy pv-anim">
              <div className="pv-chip">
                <span className="pv-chip-dot" />
                Prescription healthcare online
              </div>
              <h1 className="pv-hero-h1">
                Hormone & weight care,<br />
                <em>from Kosovo doctors</em>
              </h1>
              <p className="pv-hero-sub">
                Licensed clinicians. Regulated HRT and GLP-1 medications. Free delivery to your door.
                Start your assessment in 2 minutes.
              </p>
              <div className="pv-hero-ctas">
                <Link href="/hrt-eligibility" className="btn-primary">
                  Start HRT assessment →
                </Link>
                <Link href="/glp1-eligibility" className="btn-secondary">
                  Start GLP-1 assessment
                </Link>
              </div>
              <div className="pv-hero-trust">
                <span>Licensed doctors</span>
                <span className="pv-hero-trust-dot" />
                <span>Regulated meds</span>
                <span className="pv-hero-trust-dot" />
                <span>Free delivery</span>
              </div>
            </div>

            <div className="pv-hero-visual pv-anim">
              <div className="pv-hero-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CONFIG.IMAGES.hero} alt="Doctor consultation" loading="eager" />
              </div>
              <div className="pv-float-a">
                <div className="pv-float-a-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <div>
                  <div className="pv-float-big" data-final="2,000+">2,000+</div>
                  <div className="pv-float-label">Patients treated</div>
                </div>
              </div>
              <div className="pv-float-b">
                <div className="pv-float-b-badge">NEW</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-dark)' }}>
                  GLP-1 now available
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURES BAR ── */}
        <section className="pv-features section-sm">
          <div className="pv-features-inner">
            {FEATURES.map((f) => (
              <div key={f.title} className="pv-feature pv-anim">
                <div className="pv-feature-icon">{f.icon}</div>
                <div>
                  <div className="pv-feature-title">{f.title}</div>
                  <div className="pv-feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── TREATMENTS ── */}
        <section className="section" id="treatments">
          <div className="container">
            <div className="th-section-head pv-anim">
              <div className="th-section-tag">Treatments</div>
              <h2 className="th-section-h2">Three paths to better health</h2>
              <p className="th-section-lead">
                We specialise in three evidence-based prescription treatments, assessed and prescribed
                by our licensed clinicians.
              </p>
            </div>
          </div>
          <div className="th-products-grid">
            {/* HRT Card */}
            <div className="th-product-card-hrt pv-anim">
              <div
                className="th-product-img"
                style={{ backgroundImage: `url(${CONFIG.IMAGES['p-hrt-starter']})` }}
              >
                <div className="th-product-badge">From £49/mo</div>
              </div>
              <div className="th-product-body">
                <span className="th-product-tag">HRT</span>
                <h3 className="th-product-name">Hormone Replacement Therapy</h3>
                <p className="th-product-desc">
                  Personalised HRT for women experiencing menopause symptoms — hot flushes, mood
                  changes, brain fog, low libido, and more. Estradiol gel and micronised progesterone,
                  prescribed to your needs.
                </p>
                <div className="th-product-meds">
                  <span className="th-product-med">Estradiol gel 0.1%</span>
                  <span className="th-product-med">Micronised progesterone</span>
                </div>
                <div className="th-product-cta">
                  <div className="th-product-price">
                    <sup>£</sup>49<small>/mo</small>
                  </div>
                  <Link href="/hrt-eligibility" className="btn-primary btn-sm">
                    Check eligibility →
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
                <div className="th-product-badge">From £149/mo</div>
              </div>
              <div className="th-product-body">
                <span className="th-product-tag">GLP-1</span>
                <h3 className="th-product-name">GLP-1 Weight Management</h3>
                <p className="th-product-desc">
                  Weekly semaglutide injections for weight management in adults with a BMI of 27 or
                  above. Clinically proven to reduce body weight and support long-term metabolic health.
                </p>
                <div className="th-product-meds">
                  <span className="th-product-med">Wegovy</span>
                  <span className="th-product-med">Mounjaro</span>
                  <span className="th-product-med">Ozempic</span>
                </div>
                <div className="th-product-cta">
                  <div className="th-product-price">
                    <sup>£</sup>149<small>/mo</small>
                  </div>
                  <Link href="/glp1-eligibility" className="btn-primary btn-sm">
                    Check eligibility →
                  </Link>
                </div>
              </div>
            </div>

            {/* TRT Card */}
            <div className="th-product-card-hrt pv-anim">
              <div
                className="th-product-img"
                style={{ backgroundImage: `url(${CONFIG.IMAGES['products']})` }}
              >
                <div className="th-product-badge">Testosterone</div>
              </div>
              <div className="th-product-body">
                <span className="th-product-tag">TRT</span>
                <h3 className="th-product-name">Testosterone Replacement Therapy</h3>
                <p className="th-product-desc">
                  For men with symptoms of low testosterone — low energy, low libido, loss of muscle
                  and mood changes. Clinician-led assessment, monitored treatment.
                </p>
                <div className="th-product-meds">
                  <span className="th-product-med">Tostran gel</span>
                  <span className="th-product-med">Sustanon 250</span>
                  <span className="th-product-med">Testopel</span>
                </div>
                <div className="th-product-cta">
                  <Link href="/trt-eligibility" className="btn-primary btn-sm">
                    Check eligibility →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="section" id="how-it-works" style={{ background: 'var(--c-bg-light)' }}>
          <div className="container">
            <div className="th-section-head pv-anim">
              <div className="th-section-tag">How it works</div>
              <h2 className="th-section-h2">From quiz to prescription in 3 steps</h2>
              <p className="th-section-lead">
                We've made the process as simple as possible while keeping every safety check in place.
              </p>
            </div>
          </div>
          <div className="th-steps-grid">
            {STEPS.map((s) => (
              <div key={s.num} className="th-step-card pv-anim">
                <div className="th-step-num">{s.num}</div>
                <div className="th-step-title">{s.title}</div>
                <div className="th-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── STATS ── */}
        <section className="section">
          <div className="container" style={{ padding: 0 }}>
            <div className="pv-stats-split">
              {STATS.map((s) => (
                <div key={s.label} className="pv-stat pv-anim">
                  <div className="pv-stat-num" data-final={s.num}>{s.num}</div>
                  <div className="pv-stat-label">{s.label}</div>
                  <div className="pv-stat-bar"><div className="pv-stat-fill" /></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BMI CALCULATOR ── */}
        <section className="section" id="bmi">
          <div className="pv-bmi-shell pv-anim">
            <div className="pv-bmi-inner">
              <div className="pv-bmi-copy">
                <div className="pv-bmi-tag">GLP-1 eligibility</div>
                <h2 className="pv-bmi-h2">Check your BMI in seconds</h2>
                <p className="pv-bmi-sub">
                  GLP-1 treatment is available for adults with a BMI of 27 or above. Use our
                  calculator to see if you could qualify.
                </p>
                <div className="pv-bmi-feat">
                  <div className="pv-bmi-feat-item">BMI 27+ may qualify for GLP-1 treatment</div>
                  <div className="pv-bmi-feat-item">BMI 27–29.9 with a weight-related condition</div>
                  <div className="pv-bmi-feat-item">Reviewed by a licensed doctor</div>
                </div>
              </div>
              <div className="pv-bmi-widget">
                <BmiWidget />
              </div>
            </div>
          </div>
        </section>

        {/* ── TRUST BAND ── */}
        <section className="th-trust-band">
          <div className="th-trust-inner">
            {TRUST.map((t, i) => (
              <div key={t.title} className="th-trust-item pv-anim">
                <div className="pv-trust-ico">
                  {i === 0 && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
                      <path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/>
                      <circle cx="20" cy="10" r="2"/>
                    </svg>
                  )}
                  {i === 1 && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      <path d="m9 12 2 2 4-4"/>
                    </svg>
                  )}
                  {i === 2 && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  )}
                </div>
                <h3 className="th-trust-title">{t.title}</h3>
                <p className="th-trust-desc">{t.desc}</p>
              </div>
            ))}
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
                <div className="pv-info-card-tag">Contact us</div>
                <h3 className="pv-info-card-h3">We're here to help</h3>
                <p className="pv-info-card-desc">
                  Have questions before you start? Our team is available by email, phone, or WhatsApp.
                  We typically respond within a few hours on weekdays.
                </p>
                <div>
                  <div className="pv-contact-row">
                    Email:{' '}
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
                  <a
                    className="pv-wa-btn"
                    href={`https://wa.me/${CONFIG.CONTACT.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
                    </svg>
                    Chat on WhatsApp
                  </a>
                </div>
                <p className="pv-info-note">
                  Primavera Healthcare operates under Kosovo healthcare regulations.
                  All prescriptions are issued by licensed clinicians and dispensed by registered pharmacies.
                </p>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ── FOOTER ── */}
      <footer className="pv-footer">
        <div className="pv-footer-inner">
          <div>
            <div className="pv-footer-logo">Primavera <span>Health</span></div>
            <p className="pv-footer-tagline">
              Licensed prescription healthcare for HRT and weight management, delivered online to Kosovo.
            </p>
          </div>
          <div>
            <div className="pv-footer-col-title">Treatments</div>
            <div className="pv-footer-links">
              <Link href="/hrt-eligibility">HRT – Hormone Replacement Therapy</Link>
              <Link href="/glp1-eligibility">GLP-1 – Weight Management</Link>
            </div>
          </div>
          <div>
            <div className="pv-footer-col-title">Company</div>
            <div className="pv-footer-links">
              <Link href="/#how-it-works">How it works</Link>
              <Link href="/#contact">Contact us</Link>
              <a href={`mailto:${CONFIG.CONTACT.email}`}>Email us</a>
            </div>
          </div>
        </div>
        <div className="pv-footer-bottom">
          <span style={{ color: 'rgba(255,255,255,.4)' }}>
            © {new Date().getFullYear()} Primavera Healthcare. All rights reserved.
          </span>
          <div className="pv-footer-legal">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Cookie Policy</a>
          </div>
        </div>
      </footer>

      <ScrollReveal />
    </>
  );
}
