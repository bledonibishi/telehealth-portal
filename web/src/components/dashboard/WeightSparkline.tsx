'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { MY_WEIGHT_FORECAST, MY_WEIGHT_TIMELINE } from '@/graphql/weight';
import { kg, kgChange } from '@/lib/weight';

const DAY = 86_400_000;
const WINDOW_DAYS = 60;
const W = 320, H = 64, PAD = 6;

/**
 * The last two months of weight as a small line, the change over them, and — when the API has a
 * trend for it — the current weekly pace and where it leads in three months.
 */
export function WeightSparkline({ target }: { target?: number | null }) {
  // Fixed once, so the query isn't re-run every render.
  const [range] = useState(() => ({ from: new Date(Date.now() - WINDOW_DAYS * DAY).toISOString(), to: new Date(Date.now() + 3_600_000).toISOString() }));
  const { data } = useQuery(MY_WEIGHT_TIMELINE, { variables: { ...range, limit: 300 }, fetchPolicy: 'cache-and-network' });
  const { data: fData } = useQuery(MY_WEIGHT_FORECAST, { fetchPolicy: 'cache-and-network' });
  const fc = fData?.myWeightForecast;

  const pts: { t: number; w: number }[] = useMemo(
    () => (data?.myWeightTimeline?.measurements ?? []).map((m: any) => ({ t: Date.parse(m.measuredAt), w: m.weightKg })),
    [data],
  );

  const chart = useMemo(() => {
    if (pts.length < 2) return null;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const ws = [...pts.map((p) => p.w), ...(target && Math.abs(target - pts[pts.length - 1].w) < 25 ? [target] : [])];
    const lo = Math.min(...ws), hi = Math.max(...ws);
    const x = (t: number) => PAD + ((t - t0) / Math.max(t1 - t0, 1)) * (W - 2 * PAD);
    const y = (w: number) => PAD + ((hi - w) / Math.max(hi - lo, 0.5)) * (H - 2 * PAD);
    const last = pts[pts.length - 1];
    return {
      path: pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.w).toFixed(1)}`).join(''),
      lastX: x(last.t), lastY: y(last.w),
      targetY: target && target >= lo && target <= hi ? y(target) : null,
      change: Math.round((last.w - pts[0].w) * 10) / 10,
    };
  }, [pts, target]);

  const three = fc?.available ? fc.points.find((p: any) => p.monthsAhead === 3) : null;

  if (!chart && !fc?.available) return null;
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      {chart && (
        <>
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-[11px] text-slate-400">Last {WINDOW_DAYS} days</p>
            <p className={`text-xs font-semibold ${chart.change <= 0 ? 'text-brand-700' : 'text-slate-600'}`}>{kgChange(chart.change)}</p>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" role="img" aria-label={`Weight over the last ${WINDOW_DAYS} days: ${kgChange(chart.change)}`} preserveAspectRatio="none">
            {chart.targetY !== null && <line x1={PAD} x2={W - PAD} y1={chart.targetY} y2={chart.targetY} strokeDasharray="4 4" className="stroke-slate-300" />}
            <path d={chart.path} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-brand-600" vectorEffect="non-scaling-stroke" />
            <circle cx={chart.lastX} cy={chart.lastY} r="3.5" className="fill-brand-600" />
          </svg>
        </>
      )}
      {fc?.available && (
        <p className="text-xs text-slate-500 mt-2">
          <span className="inline-flex items-center rounded-full bg-brand-50 text-brand-700 font-semibold px-2 py-0.5 mr-1.5">{kgChange(fc.kgPerWeek)} / week</span>
          {three && <>at this pace ≈ <b className="text-slate-700">{kg(three.weightKg)}</b> in 3 months</>}
        </p>
      )}
    </div>
  );
}
