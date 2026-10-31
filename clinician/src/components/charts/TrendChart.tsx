'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The categorical slots, in a fixed order checked for colour-blind readers (blue, orange, aqua). A series keeps its slot
 * whatever else is shown. Aqua is below 3:1 on white, so every chart names its values in the legend and the tooltip.
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'];

export type Series = { key: string; label: string; values: Array<number | null> };

const M = { l: 40, r: 12, t: 12, b: 28 };
const HEIGHT = 220;

/** Round numbers for the y axis: 0 and up to three steps above it. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 3;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? rough;
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

/**
 * One measure over time: bars (side by side, or stacked when `stacked`) or lines. One y axis only; a measure on another
 * scale gets its own chart. Hovering a column shows every series' value for that period.
 */
export function TrendChart({
  labels, series, kind = 'bar', stacked = false, format = (n) => String(n), ariaLabel,
}: {
  labels: string[];
  series: Series[];
  kind?: 'bar' | 'line';
  stacked?: boolean;
  format?: (n: number) => string;
  ariaLabel: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(Math.round(e.contentRect.width), 260)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const pw = width - M.l - M.r;
  const ph = HEIGHT - M.t - M.b;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const max = stacked ? Math.max(0, ...totals) : Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const yt = ticks(max);
  const top = yt[yt.length - 1] || 1;
  const y = (v: number) => M.t + ph - (v / top) * ph;
  const band = pw / Math.max(n, 1);
  const cx = (i: number) => M.l + band * i + band / 2;
  // Thin bars: at most 60% of the band, split between the series when side by side, with a 2px gap between them.
  const groupW = Math.min(band * 0.6, stacked ? 36 : 18 * series.length);
  const barW = stacked ? groupW : Math.max((groupW - 2 * (series.length - 1)) / series.length, 3);
  // Label every month when there is room, else every other one.
  const every = band < 44 ? 2 : 1;

  return (
    <div ref={wrap} className="relative">
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" aria-hidden>
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} />{s.label}
            </li>
          ))}
        </ul>
      )}
      <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel} className="block" onMouseLeave={() => setHover(null)}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#d1d5db' : '#f1f1ef'} />
            <text x={M.l - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize="11" fill="#6b7280">{format(v)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % every === 0 || i === n - 1 ? (
          <text key={l + i} x={cx(i)} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fill={hover === i ? '#111827' : '#6b7280'}>{l}</text>
        ) : null))}

        {hover !== null && <rect x={M.l + band * hover} y={M.t} width={band} height={ph} fill="#f3f4f6" />}

        {kind === 'bar' && labels.map((_, i) => {
          let base = 0;
          return series.map((s, si) => {
            const v = s.values[i] ?? 0;
            if (v <= 0) return null;
            const x = stacked ? cx(i) - barW / 2 : cx(i) - groupW / 2 + si * (barW + 2);
            const y0 = y(base + v);
            // In a stack each segment sits on the one below, with a 2px white gap between them.
            const h = Math.max(y(base) - y0 - (stacked && base > 0 ? 2 : 0), 1);
            if (stacked) base += v;
            const r = Math.min(4, barW / 2, h / 2);
            const topSeg = !stacked || si === series.length - 1 || series.slice(si + 1).every((x2) => !(x2.values[i] ?? 0));
            // Rounded only at the data end (the top), square on the baseline.
            const d = topSeg
              ? `M${x},${y0 + h} V${y0 + r} Q${x},${y0} ${x + r},${y0} H${x + barW - r} Q${x + barW},${y0} ${x + barW},${y0 + r} V${y0 + h} Z`
              : `M${x},${y0 + h} V${y0} H${x + barW} V${y0 + h} Z`;
            return <path key={s.key + i} d={d} fill={SERIES_COLORS[si]} />;
          });
        })}

        {kind === 'line' && series.map((s, si) => {
          const pts = s.values.map((v, i) => (v === null ? null : [cx(i), y(v)] as const));
          const d = pts.reduce((acc, p, i) => (p ? `${acc}${acc && pts[i - 1] ? 'L' : 'M'}${p[0]},${p[1]}` : acc), '');
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={SERIES_COLORS[si]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => p && (hover === i || n <= 12) && (
                <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 5 : 3.5} fill={SERIES_COLORS[si]} stroke="#fff" strokeWidth="2" />
              ))}
            </g>
          );
        })}

        {/* Hit targets: the whole column, much bigger than the marks. */}
        {labels.map((l, i) => (
          <rect key={'hit' + i} x={M.l + band * i} y={M.t} width={band} height={ph} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-[9rem] rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(cx(hover) - 72, 0), width - 150), top: series.length > 1 ? 28 : 4 }}
        >
          <p className="font-semibold text-gray-900">{labels[hover]}</p>
          {series.map((s, i) => (
            <p key={s.key} className="mt-1 flex items-center gap-2 text-gray-600">
              <span className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[i] }} />
              <span className="flex-1">{s.label}</span>
              <span className="font-semibold tabular-nums text-gray-900">{s.values[hover] === null ? '—' : format(s.values[hover] ?? 0)}</span>
            </p>
          ))}
          {stacked && series.length > 1 && <p className="mt-1 border-t border-gray-100 pt-1 text-right font-semibold tabular-nums text-gray-900">{format(totals[hover])}</p>}
        </div>
      )}
    </div>
  );
}
