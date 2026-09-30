/** Circular progress indicator. `percent` is 0–100 and comes from the API. */
export function ProgressRing({ percent, size = 96 }: { percent: number; size?: number }) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(percent)} percent of your journey completed`}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-slate-100" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className="stroke-brand-600 transition-[stroke-dashoffset] duration-700"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(Math.max(percent, 0), 100) / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-slate-900 leading-none">{Number(percent.toFixed(1))}%</span>
        <span className="text-[11px] text-slate-400 mt-0.5">completed</span>
      </div>
    </div>
  );
}
