import Link from 'next/link';

const TREATMENTS = [
  {
    key: 'hrt',
    label: 'HRT',
    name: 'Hormone Replacement Therapy',
    description:
      'Evidence-based relief for perimenopause and menopause symptoms — hot flushes, brain fog, mood changes and more.',
    bullets: [
      'Prescribed by GMC-registered clinicians',
      'Estradiol gel and combined options',
      'Monthly review, adjust any time',
    ],
    cta: 'Check HRT eligibility',
    badge: 'Most popular',
    gradient: 'from-violet-50 to-purple-50',
    accentBg: 'bg-violet-600',
    accentText: 'text-violet-700',
    borderColor: 'border-violet-200',
  },
  {
    key: 'glp1',
    label: 'GLP-1',
    name: 'Weight Management (GLP-1)',
    description:
      'Clinically proven semaglutide injections to help you lose weight sustainably, supported by dietitian guidance.',
    bullets: [
      'Up to 15% body weight reduction in studies',
      'Weekly self-injection, discreetly delivered',
      'Full dietary and clinical support',
    ],
    cta: 'Check GLP-1 eligibility',
    badge: null,
    gradient: 'from-teal-50 to-emerald-50',
    accentBg: 'bg-brand-600',
    accentText: 'text-brand-700',
    borderColor: 'border-brand-200',
  },
];

const STEPS = [
  {
    number: '1',
    title: 'Take the eligibility quiz',
    body: 'Answer a few medical questions. Takes under 3 minutes. No account needed.',
  },
  {
    number: '2',
    title: 'Choose your plan',
    body: 'If eligible, pick the treatment and subscription that suits you.',
  },
  {
    number: '3',
    title: 'Receive your prescription',
    body: 'A registered clinician reviews your case and, if approved, issues a prescription delivered to your door.',
  },
];

const TRUST = [
  { label: 'CQC-regulated service' },
  { label: 'GMC-registered clinicians' },
  { label: 'UK-licensed medications' },
  { label: 'Free next-day delivery' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-bold text-xl text-slate-900 tracking-tight">telehealth</span>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#treatments" className="hover:text-slate-900 transition-colors">Treatments</a>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How it works</a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 text-white py-28 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase text-brand-300 mb-4">
              CQC-regulated · UK clinicians
            </span>
            <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
              Clinically backed treatments,{' '}
              <span className="text-brand-400">tailored to you</span>
            </h1>
            <p className="text-xl text-slate-300 mb-10 max-w-xl mx-auto">
              HRT for menopause relief and GLP-1 for sustainable weight management — prescribed online by
              UK-registered clinicians.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/quiz?product=hrt"
                className="inline-flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white font-semibold px-8 py-4 rounded-xl transition-colors text-lg"
              >
                Check HRT eligibility
              </Link>
              <Link
                href="/quiz?product=glp1"
                className="inline-flex items-center justify-center bg-brand-500 hover:bg-brand-600 text-white font-semibold px-8 py-4 rounded-xl transition-colors text-lg"
              >
                Check GLP-1 eligibility
              </Link>
            </div>
          </div>
        </section>

        {/* Trust bar */}
        <div className="bg-slate-50 border-b border-slate-100 py-4 px-6">
          <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-8">
            {TRUST.map((t) => (
              <div key={t.label} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                {t.label}
              </div>
            ))}
          </div>
        </div>

        {/* Treatments */}
        <section id="treatments" className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-4xl font-bold text-slate-900 mb-4">Our treatments</h2>
              <p className="text-lg text-slate-500 max-w-xl mx-auto">
                Evidence-based medications prescribed by clinicians who specialise in your condition.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {TREATMENTS.map((t) => (
                <div
                  key={t.key}
                  className={`rounded-2xl border ${t.borderColor} bg-gradient-to-br ${t.gradient} p-8 flex flex-col`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className={`text-xs font-bold uppercase tracking-widest ${t.accentText}`}>
                      {t.label}
                    </span>
                    {t.badge && (
                      <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-3">{t.name}</h3>
                  <p className="text-slate-600 mb-6 flex-1">{t.description}</p>
                  <ul className="space-y-2 mb-8">
                    {t.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className={`mt-0.5 w-4 h-4 rounded-full ${t.accentBg} flex items-center justify-center flex-shrink-0`}>
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                        {b}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/quiz?product=${t.key}`}
                    className={`w-full text-center ${t.accentBg} hover:opacity-90 text-white font-semibold py-3 px-6 rounded-xl transition-opacity`}
                  >
                    {t.cta} →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="py-24 px-6 bg-slate-50">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-4xl font-bold text-slate-900 mb-4">How it works</h2>
              <p className="text-lg text-slate-500">From quiz to delivery in as little as 24 hours.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {STEPS.map((s) => (
                <div key={s.number} className="text-center">
                  <div className="w-14 h-14 rounded-full bg-brand-500 text-white text-xl font-bold flex items-center justify-center mx-auto mb-5">
                    {s.number}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{s.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-14 text-center">
              <p className="text-slate-500 text-sm mb-6">Not sure where to start?</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/quiz?product=hrt"
                  className="inline-flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors"
                >
                  Start HRT quiz
                </Link>
                <Link
                  href="/quiz?product=glp1"
                  className="inline-flex items-center justify-center bg-brand-600 hover:bg-brand-700 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors"
                >
                  Start GLP-1 quiz
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-10 px-6 text-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-4">
          <div>
            <span className="font-bold text-white text-base">telehealth</span>
            <p className="mt-1 text-xs max-w-xs">
              CQC-regulated online clinic. Registered in England and Wales.
            </p>
          </div>
          <div className="text-xs space-y-1 text-slate-500">
            <p>For emergencies, call 999 or visit A&E.</p>
            <p>This service does not replace emergency care.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
