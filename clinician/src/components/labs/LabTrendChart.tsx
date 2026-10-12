'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';
import type { LabResult } from './labs-format';

/**
 * One test over time: a line through its results, the lab's reference range as a shaded band when it has one, and a
 * red dot on any result that was out of range. Drawn by hand: a handful of points needs no chart library.
 */
export function LabTrendChart({ points, height = 72 }: { points: LabResult[]; height?: number }) {
  const { t, fmt } = useI18n();
  const W = 320;
  const padX = 8;
  const padY = 10;
  const last = points[points.length - 1];
  const low = last.referenceRangeLow ?? null;
  const high = last.referenceRangeHigh ?? null;

  const values = points.map((p) => p.value);
  const lo = Math.min(...values, ...(low != null ? [low] : []));
  const hi = Math.max(...values, ...(high != null ? [high] : []));
  const span = hi - lo || Math.max(Math.abs(hi), 1);
  const yOf = (v: number) => padY + (1 - (v - lo) / span) * (height - padY * 2);

  const times = points.map((p) => new Date(p.collectedAt).getTime());
  const t0 = times[0];
  const tSpan = times[times.length - 1] - t0;
  const xOf = (i: number) => (points.length === 1 || tSpan === 0 ? W / 2 : padX + ((times[i] - t0) / tSpan) * (W - padX * 2));

  const line = points.map((_, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(values[i]).toFixed(1)}`).join(' ');
  const bandTop = high != null ? yOf(high) : padY;
  const bandBottom = low != null ? yOf(low) : height - padY;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto" role="img" aria-label={t('Trend over {n} results', { n: points.length })}>
        {(low != null || high != null) && <rect x={0} y={bandTop} width={W} height={Math.max(bandBottom - bandTop, 1)} fill="#16a34a" opacity={0.1} />}
        {points.length > 1 && <path d={line} fill="none" stroke="#0f766e" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {points.map((p, i) => (
          <circle key={p.id} cx={xOf(i)} cy={yOf(p.value)} r={3.2} fill={p.flagged ? '#dc2626' : '#0f766e'} stroke="#fff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-gray-400 mt-0.5">
        <span>{fmt(points[0].collectedAt, 'MMM yyyy')}</span>
        {points.length > 1 ? <span>{fmt(last.collectedAt, 'MMM yyyy')}</span> : <span>{t('Only one result so far')}</span>}
      </div>
    </div>
  );
}
