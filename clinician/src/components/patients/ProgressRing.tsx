/** A circular loader showing how much of the weight goal is done (0–100). */
export default function ProgressRing({
  value, size = 36, stroke = 4, showLabel = false,
}: { value?: number | null; size?: number; stroke?: number; showLabel?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const has = value !== null && value !== undefined;
  const pct = has ? Math.min(Math.max(value, 0), 100) : 0;
  const done = pct >= 100;
  const color = done ? 'stroke-emerald-400' : pct >= 50 ? 'stroke-sky-400' : pct > 0 ? 'stroke-sky-500' : 'stroke-[color:var(--border-strong)]';

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={has ? Math.round(pct) : undefined}
      aria-label="Goal progress"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-[color:var(--border)]" />
        {has && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
            className={`${color} transition-[stroke-dashoffset] duration-500`}
          />
        )}
      </svg>
      <span className={`absolute font-semibold text-[color:var(--t-strong)] ${showLabel ? 'text-xl' : size <= 36 ? 'text-[9px]' : 'text-[10px]'}`}>
        {has ? `${Math.round(pct)}%` : '—'}
      </span>
    </div>
  );
}
