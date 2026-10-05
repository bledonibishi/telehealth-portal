'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { kg } from '@/lib/weight';
import { useRecentWeights } from '@/lib/useRecentWeights';
import { Card } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';

const W = 240, H = 160, M = { l: 24, r: 6, t: 8, b: 20 };

/** Rounded y-axis ticks covering the range, about 5 of them. */
function ticks(lo: number, hi: number) {
  const step = Math.max(1, Math.ceil((hi - lo) / 4 / 5) * 5) || 5;
  const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + 1e-9; v += step) out.push(v);
  return out.length > 1 ? out : [start, start + step];
}

/** Start and current weight, what has been lost, and the weigh-ins over the last three months as a chart with dates. */
export function WeightProgressCard({ journey }: { journey: any }) {
  const { points, forecast } = useRecentWeights();
  const lost = journey.weightLostKg != null ? journey.weightLostKg : journey.startingWeightKg && journey.currentWeightKg ? journey.startingWeightKg - journey.currentWeightKg : null;
  const three = forecast?.available ? forecast.points.find((p: any) => p.monthsAhead === 3) : null;

  const chart = useMemo(() => {
    if (points.length < 2) return null;
    const ws = points.map((p) => p.w);
    const ys = ticks(Math.min(...ws) - 1, Math.max(...ws) + 1);
    const lo = ys[0], hi = ys[ys.length - 1];
    const t0 = points[0].t, t1 = points[points.length - 1].t;
    const x = (t: number) => M.l + ((t - t0) / Math.max(t1 - t0, 1)) * (W - M.l - M.r);
    const y = (w: number) => M.t + ((hi - w) / Math.max(hi - lo, 1)) * (H - M.t - M.b);
    const xTicks = points.length <= 4 ? points.map((p) => p.t) : [0, 1 / 3, 2 / 3, 1].map((f) => t0 + f * (t1 - t0));
    return { x, y, ys, xTicks, path: points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.w).toFixed(1)}`).join('') };
  }, [points]);

  return (
    <Card labelledBy="progress-title" className="h-full flex flex-col">
      <h2 id="progress-title" className="text-lg font-bold text-ink-900">Your Progress</h2>
      <div className="grid grid-cols-2 mt-3">
        <div className="pr-3 border-r border-slate-100">
          <p className="text-xs text-slate-500">Starting Weight</p>
          <p className="text-xl font-bold text-ink-900 mt-1">{kg(journey.startingWeightKg)}</p>
        </div>
        <div className="pl-4 text-right">
          <p className="text-xs text-slate-500">Current Weight</p>
          <p className="text-xl font-bold text-ink-900 mt-1">{kg(journey.currentWeightKg)}</p>
          {lost != null && lost > 0 && <p className="text-sm font-semibold text-emerald-600 mt-0.5">↓ {kg(lost)}</p>}
        </div>
      </div>

      {chart ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-4" role="img" aria-label={`Weight from ${kg(points[0].w)} to ${kg(points[points.length - 1].w)} over the last three months`}>
          {chart.ys.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={chart.y(v)} y2={chart.y(v)} className="stroke-slate-100" />
              <text x={M.l - 5} y={chart.y(v) + 3} textAnchor="end" className="fill-slate-400" fontSize="9">{v}</text>
            </g>
          ))}
          {chart.xTicks.map((t, i) => (
            <text key={i} x={chart.x(t)} y={H - 5} textAnchor={i === 0 ? 'start' : i === chart.xTicks.length - 1 ? 'end' : 'middle'} className="fill-slate-400" fontSize="9">{format(new Date(t), 'd MMM')}</text>
          ))}
          <path d={chart.path} fill="none" strokeWidth="1.8" strokeLinejoin="round" className="stroke-ink-600" />
          {points.map((p, i) => <circle key={i} cx={chart.x(p.t)} cy={chart.y(p.w)} r="2.6" className="fill-ink-600" />)}
        </svg>
      ) : (
        <p className="text-sm text-slate-500 mt-4 bg-slate-50 rounded-xl p-4">Log your weight a couple of times and your chart will appear here.</p>
      )}

      {three && <p className="text-xs text-slate-500 mt-2">At this pace ≈ <b className="text-ink-900">{kg(three.weightKg)}</b> in 3 months.</p>}

      {lost != null && lost > 0 && (
        <div className="mt-auto pt-4">
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-100 p-3">
            <span className="w-6 h-6 rounded-full border-2 border-emerald-500 text-emerald-600 flex items-center justify-center flex-shrink-0"><Icon name="check" className="w-3.5 h-3.5" /></span>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Great progress!</p>
              <p className="text-xs text-emerald-700">You’ve lost {kg(lost)} since starting your treatment.</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
