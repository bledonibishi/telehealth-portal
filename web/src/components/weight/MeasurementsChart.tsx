'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_BODY_MEASUREMENTS } from '@/graphql/weight';
import { cmChange, MEASURE_COLORS, MEASURES, seriesOf, type BodyMeasurement, type MeasureKey } from '@/lib/body-measurements';
import { niceStep, smoothPath } from '@/lib/timeseries';

const M = { l: 44, r: 14, t: 12, b: 26 };

/**
 * Waist, hips and upper arm on one chart. A waist of 100 cm and an arm of 35 cm can't share an axis
 * without flattening both, so each line shows how far that measure has moved since it was first
 * taken: all three start at 0, and down is progress. The real centimetres are in the read-out.
 */
export function MeasurementsChart() {
  const { data, loading } = useQuery(MY_BODY_MEASUREMENTS, { fetchPolicy: 'cache-and-network' });
  const list: BodyMeasurement[] = data?.myBodyMeasurements ?? [];
  // Held in state, not a ref: the chart only exists once there are two entries, and the width must be measured then.
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [hoverT, setHoverT] = useState<number | null>(null);

  useEffect(() => {
    if (!wrap) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(Math.round(e.contentRect.width), 240)));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [wrap]);

  const series = useMemo(
    () => MEASURES.map((m) => {
      const pts = seriesOf(list, m.key);
      return { ...m, color: MEASURE_COLORS[m.key], pts: pts.map((p) => ({ ...p, change: Number((p.cm - pts[0].cm).toFixed(1)) })) };
    }).filter((s) => s.pts.length > 0),
    [list],
  );
  const times = useMemo(() => [...new Set(list.map((m) => Date.parse(m.measuredAt)))].sort((a, b) => a - b), [list]);

  if (loading && !data) return <div className="h-[220px] rounded-md bg-slate-50 animate-pulse" role="status" aria-label="Loading your measurements" />;
  if (times.length < 2) {
    return <p className="text-sm text-slate-500 py-6 text-center">{times.length === 0 ? 'Add your waist, hips and arm measurements above to see them here.' : 'Add your measurements a second time and the lines will appear here.'}</p>;
  }

  const height = width < 480 ? 200 : 240;
  const pw = width - M.l - M.r, ph = height - M.t - M.b;
  const t0 = times[0], t1 = times[times.length - 1];
  const all = series.flatMap((s) => s.pts.map((p) => p.change));
  const step = niceStep(Math.max(Math.max(...all, 0) - Math.min(...all, 0), 1), 4);
  const lo = Math.floor(Math.min(...all, 0) / step) * step, hi = Math.ceil(Math.max(...all, 0) / step) * step || step;
  const x = (t: number) => M.l + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * pw;
  const y = (v: number) => M.t + ((hi - v) / (hi - lo)) * ph;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v * 10) / 10);
  // A date label at most every ~90px, always including the first and the last.
  const every = Math.max(1, Math.ceil(times.length / Math.max(Math.floor(pw / 90), 2)));
  const dateTicks = times.filter((_, i) => i % every === 0 || i === times.length - 1);

  const nearest = (clientX: number) => {
    const left = wrap!.getBoundingClientRect().left;
    const t = t0 + ((clientX - left - M.l) / pw) * (t1 - t0);
    return times.reduce((best, cur) => (Math.abs(cur - t) < Math.abs(best - t) ? cur : best), times[0]);
  };
  const shownT = hoverT ?? t1;
  const readout = series.map((s) => ({ ...s, at: [...s.pts].reverse().find((p) => p.t <= shownT) ?? null }));

  return (
    <div>
      <div ref={setWrap} className="relative w-full select-none">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" style={{ display: 'block', touchAction: 'pan-y' }}
          aria-label={`Change in body measurements from ${format(t0, 'd MMM yyyy')} to ${format(t1, 'd MMM yyyy')}. ${series.map((s) => `${s.label} ${cmChange(s.pts[s.pts.length - 1].change)}`).join(', ')}.`}
          onPointerMove={(e) => setHoverT(nearest(e.clientX))} onPointerDown={(e) => setHoverT(nearest(e.clientX))} onPointerLeave={(e) => e.pointerType === 'mouse' && setHoverT(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={M.l + pw} y1={y(v)} y2={y(v)} className="stroke-slate-300" strokeOpacity={v === 0 ? 0.7 : 0.3} strokeDasharray={v === 0 ? '4 4' : undefined} />
              <text x={M.l - 8} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{v > 0 ? `+${v}` : v}</text>
            </g>
          ))}
          {dateTicks.map((t, i) => (
            <text key={t} x={x(t)} y={height - 8} textAnchor={i === 0 ? 'start' : t === t1 ? 'end' : 'middle'} className="fill-slate-400 text-[11px]">{format(t, 'd MMM')}</text>
          ))}
          <line x1={x(shownT)} x2={x(shownT)} y1={M.t} y2={M.t + ph} strokeDasharray="3 3" className="stroke-slate-400" opacity={hoverT === null ? 0 : 1} />
          {series.map((s) => (
            <g key={s.key}>
              <path d={smoothPath(s.pts.map((p) => ({ x: x(p.t), y: y(p.change) })))} fill="none" stroke={s.color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="wj-draw" />
              {s.pts.map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.change)} r={p.t === shownT && hoverT !== null ? 5 : 3} fill="white" stroke={s.color} strokeWidth="2" />)}
            </g>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 px-1 text-xs" aria-live="polite">
        <span className="text-slate-500 font-medium">{format(shownT, 'd MMM yyyy')}</span>
        {readout.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label} <b className="text-slate-900">{s.at ? `${s.at.cm} cm` : '—'}</b>
            {s.at && s.at.change !== 0 && <span className={s.at.change < 0 ? 'text-emerald-700' : 'text-slate-400'}>({cmChange(s.at.change)})</span>}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-1 px-1">Centimetres gained or lost since each was first measured. Hover or tap the chart for another date.</p>
    </div>
  );
}
