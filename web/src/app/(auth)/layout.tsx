// Split-screen shell for every sign-in page: the brand on the left, the form on the right.
// To use a photo, save it as web/public/auth/hero.jpg; until then the gradient shows.
const BACKDROP = 'linear-gradient(to bottom right, rgba(11,26,61,.88), rgba(19,78,74,.78)), url(/auth/hero.jpg)';

// One 15 s loop, five seconds per scene: a line drawing (a doctor, a treatment pen, a parcel) that draws itself,
// holds, and is rubbed out. The matching line of the list below brightens while its drawing is on screen.
const SCENES = [
  { key: 'doctor', start: 0, label: 'Message your care team' },
  { key: 'pen', start: 100 / 3, label: 'Follow your treatment and progress' },
  { key: 'parcel', start: 200 / 3, label: 'Manage your orders and deliveries' },
];
const f = (n: number) => n.toFixed(2);
const css = `
${SCENES.map(({ key, start }) => `
@keyframes draw-${key}{0%,${f(start)}%{stroke-dashoffset:1}${f(start + 11)}%,${f(start + 25)}%{stroke-dashoffset:0}${f(start + 31)}%,100%{stroke-dashoffset:-1}}
@keyframes show-${key}{0%,${f(start)}%{opacity:.45}${f(start + 4)}%,${f(start + 28)}%{opacity:1}${f(start + 32)}%,100%{opacity:.45}}
.scene-${key} *{animation:draw-${key} 15s ease-in-out infinite;stroke-dasharray:1 1;stroke-dashoffset:1}
.legend-${key}{animation:show-${key} 15s ease-in-out infinite}`).join('')}
@media (prefers-reduced-motion:reduce){
  .scene-doctor *{animation:none;stroke-dashoffset:0}
  [class*=legend-]{animation:none;opacity:1}
}`;

const SVG = { viewBox: '0 0 200 160', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const d = (i: number) => ({ pathLength: 1, style: { animationDelay: `${i * 0.12}s` } });

function LineDrawings() {
  return (
    <div className="relative w-full max-w-xs lg:max-w-sm text-brand-100" aria-hidden>
      <style>{css}</style>
      <svg {...SVG} className="scene-doctor absolute inset-0 h-full w-full">
        <circle cx="100" cy="46" r="20" {...d(0)} />
        <path d="M52 142C52 104 74 84 100 84s48 20 48 58" {...d(1)} />
        <path d="M84 86l16 28 16-28" {...d(2)} />
        <path d="M74 98c-5 22 2 36 20 36" {...d(3)} />
        <circle cx="98" cy="134" r="4" {...d(4)} />
        <path d="M128 108h14M135 101v14" {...d(5)} />
      </svg>
      <svg {...SVG} className="scene-pen absolute inset-0 h-full w-full">
        <rect x="30" y="64" width="110" height="32" rx="6" {...d(0)} />
        <path d="M140 72h18v16h-18" {...d(1)} />
        <path d="M158 80h28" {...d(2)} />
        <rect x="56" y="72" width="40" height="16" rx="3" {...d(3)} />
        <path d="M30 72h-14v16h14" {...d(4)} />
        <path d="M64 80h24" {...d(5)} />
      </svg>
      <svg {...SVG} className="scene-parcel absolute inset-0 h-full w-full">
        <path d="M40 56L100 28l60 28v56l-60 28-60-28z" {...d(0)} />
        <path d="M40 56l60 28 60-28" {...d(1)} />
        <path d="M100 84v56" {...d(2)} />
        <path d="M70 42l60 28" {...d(3)} />
      </svg>
      <div className="aspect-[200/160]" />
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 md:bg-white">
      {/* Tablets and up: the brand takes a side of the screen (45% on tablets, 65% on laptops). Phones get the form alone. */}
      <aside
        className="hidden md:flex md:w-[45%] lg:w-[65%] relative overflow-hidden flex-col justify-between p-10 lg:p-14 text-white bg-gradient-to-br from-ink-950 via-ink-900 to-brand-900 bg-cover bg-center"
        style={{ backgroundImage: BACKDROP }}
      >
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-ink-500/20 blur-3xl" aria-hidden />

        <span className="relative font-bold text-3xl tracking-tight">Omopharmacy</span>

        <div className="relative max-w-xl">
          <h2 className="text-3xl lg:text-4xl xl:text-5xl font-semibold leading-tight tracking-tight">Your care, all in one place.</h2>
          <p className="mt-5 text-base lg:text-lg text-white/75">Your treatment, your care team and your orders, wherever you are.</p>
          <div className="mt-8"><LineDrawings /></div>
          <ul className="mt-8 space-y-3">
            {SCENES.map(({ key, label }) => (
              <li key={key} className={`legend-${key} flex items-center gap-3 text-white/90`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/30 text-brand-100 text-sm" aria-hidden>✓</span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/50">Patient portal</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 md:px-8 py-10 md:py-12">
        <div className="w-full max-w-sm">
          <div className="md:hidden text-center mb-8">
            <span className="font-bold text-2xl text-slate-900 tracking-tight">Omopharmacy</span>
            <p className="text-sm text-slate-500 mt-1">Patient portal</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-6 md:p-0 md:rounded-none md:shadow-none md:border-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
