'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import type { SymptomAssessment } from './types';

const M = { l: 34, r: 14, t: 12, b: 26 };

/** Total score over time. Plain SVG; lower is better, so the axis is labelled that way. */
export function SymptomChart({ assessments }: { assessments: SymptomAssessment[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(Math.round(e.contentRect.width), 240)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { minScore, maxScore } = assessments[0];
  const height = 220;
  const pw = width - M.l - M.r;
  const ph = height - M.t - M.b;
  const n = assessments.length;
  // Real time axis, so a gap of two months looks like one.
  const times = assessments.map((a) => new Date(a.recordedAt).getTime());
  const span = times[n - 1] - times[0];
  const x = (i: number) => M.l + (span === 0 ? pw / 2 : ((times[i] - times[0]) / span) * pw);
  const y = (score: number) => M.t + (1 - (score - minScore) / (maxScore - minScore)) * ph;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(minScore + f * (maxScore - minScore)));
  const path = assessments.map((a, i) => `${i ? 'L' : 'M'}${x(i)},${y(a.totalScore)}`).join(' ');
  const shown = hover !== null ? assessments[hover] : null;

  return (
    <div ref={wrapRef} className="relative">
      <svg width={width} height={height} role="img" aria-label="Symptom score over time">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} stroke="#f1f5f9" />
            <text x={M.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{t}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#0d9488" strokeWidth={2} />
        {assessments.map((a, i) => (
          <g key={a.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
            <circle cx={x(i)} cy={y(a.totalScore)} r={14} fill="transparent" />
            <circle cx={x(i)} cy={y(a.totalScore)} r={hover === i ? 5 : 3.5} fill="#fff" stroke="#0d9488" strokeWidth={2} />
          </g>
        ))}
        {[0, n - 1].filter((i, k, arr) => arr.indexOf(i) === k).map((i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor={span === 0 ? 'middle' : i === 0 ? 'start' : 'end'} fontSize="10" fill="#94a3b8">
            {format(new Date(assessments[i].recordedAt), 'd MMM yyyy')}
          </text>
        ))}
      </svg>
      {shown && (
        <div className="absolute top-0 right-0 bg-white border border-slate-100 shadow-sm rounded-lg px-3 py-2 text-xs">
          <p className="font-semibold text-slate-900">{shown.totalScore} · {shown.severity}</p>
          <p className="text-slate-400">{format(new Date(shown.recordedAt), 'd MMMM yyyy')}</p>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-1">Total score — lower means fewer or milder symptoms.</p>
    </div>
  );
}
