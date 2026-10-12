'use client';

import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useI18n } from '@/lib/i18n/I18nProvider';

// Split-screen shell for every sign-in page: the brand on the left, the form on the right.
// To use a photo, save it as clinician/public/auth/hero.jpg; until then the dark panel shows.
// Dots, drawn in CSS, over a dark slate: calmer and more tool-like than the patient side.
const DOTS = 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)';
const BACKDROP = `${DOTS}, linear-gradient(to bottom right, rgba(2,6,23,.92), rgba(15,23,42,.88)), url(/auth/hero.jpg)`;

// One 15 s loop, five seconds per scene: a line drawing (a doctor, a pharmacy, a support agent), held, then rubbed out.
const SCENES = [
  { key: 'doctor', start: 0 },
  { key: 'pharmacy', start: 100 / 3 },
  { key: 'support', start: 200 / 3 },
];
const f = (n: number) => n.toFixed(2);
const css = `
${SCENES.map(({ key, start }) => `
@keyframes draw-${key}{0%,${f(start)}%{stroke-dashoffset:1}${f(start + 11)}%,${f(start + 25)}%{stroke-dashoffset:0}${f(start + 31)}%,100%{stroke-dashoffset:-1}}
@keyframes show-${key}{0%,${f(start)}%{opacity:.4}${f(start + 4)}%,${f(start + 28)}%{opacity:1}${f(start + 32)}%,100%{opacity:.4}}
.scene-${key} path,.scene-${key} circle,.scene-${key} rect{animation:draw-${key} 15s ease-in-out infinite;stroke-dasharray:1 1;stroke-dashoffset:1}
.legend-${key}{animation:show-${key} 15s ease-in-out infinite}`).join('')}
@media (prefers-reduced-motion:reduce){
  .scene-doctor path,.scene-doctor circle,.scene-doctor rect{animation:none;stroke-dashoffset:0}
  [class*=legend-]{animation:none;opacity:1}
}`;

const SVG = { viewBox: '0 0 200 160', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const drawn = (i: number) => ({ pathLength: 1, style: { animationDelay: `${i * 0.12}s` } });

/** Line drawings that draw themselves, hold, and are rubbed out, one role after another. No patient data. */
function LineDrawings() {
  return (
    <div className="relative max-w-md text-sky-200" aria-hidden>
      <style>{css}</style>
      <svg {...SVG} className="scene-doctor absolute inset-0 h-full w-full">
        <circle cx="100" cy="46" r="20" {...drawn(0)} />
        <path d="M52 142C52 104 74 84 100 84s48 20 48 58" {...drawn(1)} />
        <path d="M84 86l16 28 16-28" {...drawn(2)} />
        <path d="M74 98c-5 22 2 36 20 36" {...drawn(3)} />
        <circle cx="98" cy="134" r="4" {...drawn(4)} />
        <path d="M128 108h14M135 101v14" {...drawn(5)} />
      </svg>
      <svg {...SVG} className="scene-pharmacy absolute inset-0 h-full w-full">
        <path d="M100 14v26M87 27h26" {...drawn(0)} />
        <path d="M40 82l16-30h88l16 30z" {...drawn(1)} />
        <path d="M50 82v60h100V82" {...drawn(2)} />
        <rect x="88" y="104" width="24" height="38" rx="2" {...drawn(3)} />
        <rect x="60" y="98" width="20" height="24" rx="2" {...drawn(4)} />
        <rect x="120" y="98" width="20" height="24" rx="2" {...drawn(5)} />
        <path d="M30 142h140" {...drawn(6)} />
      </svg>
      <svg {...SVG} className="scene-support absolute inset-0 h-full w-full">
        <circle cx="96" cy="76" r="24" {...drawn(0)} />
        <path d="M68 74a28 28 0 0 1 56 0" {...drawn(1)} />
        <rect x="62" y="68" width="9" height="18" rx="4" {...drawn(2)} />
        <rect x="121" y="68" width="9" height="18" rx="4" {...drawn(3)} />
        <path d="M126 86c0 14-12 20-26 20" {...drawn(4)} />
        <path d="M50 146c0-26 22-40 46-40s46 14 46 40" {...drawn(5)} />
        <path d="M142 18h40a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6h-20l-10 8v-8h-10a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6z" {...drawn(6)} />
      </svg>
      <div className="aspect-[200/160]" />
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const legend = [
    ['doctor', t('Doctors'), t('Review consultations and prescribe')],
    ['pharmacy', t('Pharmacy partners'), t('See the orders to prepare and send')],
    ['support', t('Care team'), t('Follow patients and answer their messages')],
  ];
  return (
    <div className="min-h-screen flex bg-white">
      <aside
        className="hidden md:flex md:w-[45%] lg:w-[55%] relative overflow-hidden flex-col justify-between gap-8 p-10 lg:p-14 text-white bg-slate-950 bg-cover bg-center"
        style={{ backgroundImage: BACKDROP, backgroundSize: '22px 22px, cover, cover' }}
      >
        <div className="absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-brand-500/20 blur-3xl" aria-hidden />

        <div className="relative flex items-center gap-3">
          <span className="font-bold text-2xl tracking-tight">Omopharmacy</span>
          <span className="rounded-md border border-white/20 px-2 py-0.5 text-xs uppercase tracking-wider text-white/70">{t('Clinic portal')}</span>
        </div>

        <div className="relative space-y-8">
          <h2 className="max-w-lg text-3xl lg:text-4xl font-semibold leading-tight tracking-tight">{t('One workspace for the whole care team.')}</h2>
          <LineDrawings />
          <ul className="grid max-w-xl gap-2 text-sm text-white/70">
            {legend.map(([key, who, what]) => (
              <li key={key} className={`legend-${key}`}><span className="font-semibold text-white">{who}</span> · {what}</li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">{t('For authorised staff only. Sign-ins and actions are logged.')}</p>
      </aside>

      <main className="relative flex flex-1 items-center justify-center px-4 md:px-8 py-10 md:py-12 bg-gray-50 md:bg-white">
        <div className="absolute top-4 right-4"><LanguageSwitcher onLight /></div>
        <div className="w-full max-w-sm">
          <div className="md:hidden text-center mb-8">
            <span className="font-bold text-2xl text-gray-900 tracking-tight">Omopharmacy</span>
            <p className="text-sm text-gray-500 mt-1">{t('Staff sign-in')}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 md:p-0 md:rounded-none md:shadow-none md:border-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
