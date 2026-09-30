'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_WEIGHT_JOURNEY, VOID_MY_WEIGHT } from '@/graphql/weight';
import { useWeightTimeline } from '@/lib/useWeightTimeline';
import { fromMonthKey, lowerBound, monthEnd, monthKey, monthStart, panBy, Point, View } from '@/lib/timeseries';
import { feelingOf, kg, kgChange } from '@/lib/weight';
import { WeightChart } from './WeightChart';
import { LogWeightForm } from './LogWeightForm';

type Mode = 'month' | '3M' | '6M' | '1Y' | 'All' | 'custom';
const PRESETS: { key: Exclude<Mode, 'custom'>; label: string }[] = [
  { key: 'month', label: 'Month' }, { key: '3M', label: '3M' }, { key: '6M', label: '6M' }, { key: '1Y', label: '1Y' }, { key: 'All', label: 'All' },
];
const MONTHS_BACK: Record<string, number> = { month: 0, '3M': 2, '6M': 5, '1Y': 11 };
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const card = 'bg-white rounded-2xl border border-slate-100 p-5 sm:p-6 mb-4';
const heading = 'text-xs font-semibold text-brand-700 uppercase tracking-wide';

function useSwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current; start.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 40) (dx < 0 ? onNext : onPrev)(); // swipe left → later month
    },
  };
}

export function WeightExplorer() {
  const tl = useWeightTimeline();
  const { points, meta } = tl;
  const nowMs = useRef(Date.now()).current;

  const [key, setKey] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('3M');
  const [view, setView] = useState<View | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidWeight, { loading: voiding }] = useMutation(VOID_MY_WEIGHT, { refetchQueries: [{ query: MY_WEIGHT_JOURNEY }] });

  // Navigation limits: from the first measurement (or the intake) to the current month.
  const bounds: View = useMemo(() => {
    const earliest = Math.min(...[meta?.earliestAt, meta?.startingAt].filter((v): v is number => typeof v === 'number'), nowMs - 30 * 86_400_000);
    const first = fromMonthKey(monthKey(earliest));
    const last = fromMonthKey(monthKey(Math.max(nowMs, meta?.latestAt ?? 0)));
    return [monthStart(first.year, first.month), monthEnd(last.year, last.month)];
  }, [meta, nowMs]);
  const minKey = monthKey(bounds[0]);
  const maxKey = monthKey(bounds[1]);
  const clampKey = useCallback((k: number) => Math.min(Math.max(k, minKey), maxKey), [minKey, maxKey]);

  const viewFor = useCallback((m: Exclude<Mode, 'custom'>, k: number): View => {
    if (m === 'All') return bounds;
    const end = fromMonthKey(k);
    const begin = fromMonthKey(k - MONTHS_BACK[m]);
    return [Math.max(monthStart(begin.year, begin.month), bounds[0]), monthEnd(end.year, end.month)];
  }, [bounds]);

  // First render of real data: open on the month of the latest measurement, showing the last three months.
  useEffect(() => {
    if (key !== null || !meta) return;
    const k = clampKey(monthKey(Math.min(meta.latestAt ?? nowMs, nowMs)));
    setKey(k);
    setView(viewFor('3M', k));
  }, [meta, key, clampKey, viewFor, nowMs]);

  useEffect(() => { if (view) tl.ensureRange(view[0], view[1]); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const goMonth = useCallback((k: number) => {
    const next = clampKey(k);
    const m = mode === 'custom' ? 'month' : mode;
    setKey(next); setMode(m); setView(viewFor(m, next)); setSelectedId(null); setConfirmId(null);
  }, [clampKey, mode, viewFor]);
  const preset = (m: Exclude<Mode, 'custom'>) => { if (key === null) return; setMode(m); setView(viewFor(m, key)); };
  const onChartView = useCallback((v: View) => { setView(v); setMode('custom'); setKey(clampKey(monthKey(v[1] - 1))); }, [clampKey]);
  const reset = () => preset(mode === 'custom' ? '3M' : mode);
  const swipe = useSwipe(() => key !== null && goMonth(key - 1), () => key !== null && goMonth(key + 1));

  const monthPoints = useMemo(() => {
    if (key === null) return [] as Point[];
    const { year, month } = fromMonthKey(key);
    const a = monthStart(year, month), b = monthEnd(year, month);
    return points.filter((p) => p.t >= a && p.t <= b).reverse(); // newest first
  }, [points, key]);

  const onSaved = useCallback(async (at: number) => {
    await tl.refresh();
    const k = clampKey(monthKey(at));
    const m = mode === 'custom' ? '3M' : mode;
    setKey(k); setMode(m); setView(viewFor(m, k)); setSelectedId(null);
  }, [tl, clampKey, mode, viewFor]);

  const selectRow = (p: Point) => {
    setSelectedId(p.id === selectedId ? null : p.id);
    if (view && (p.t < view[0] || p.t > view[1])) { const c = (view[0] + view[1]) / 2; setView(panBy(view, p.t - c, bounds)); }
  };
  const remove = async (id: string) => {
    setVoidError(null);
    try { await voidWeight({ variables: { entryId: id } }); setConfirmId(null); setSelectedId(null); await tl.refresh(); }
    catch (e: any) { setVoidError(e?.message ?? 'Couldn’t remove that entry.'); }
  };

  // The target and starting weight come from the same journey query the card above refreshes when a
  // target is saved, so the chart's line follows immediately (the timeline query only supplies the start *date*).
  const { data: journeyData } = useQuery(MY_WEIGHT_JOURNEY);
  const journey = journeyData?.myWeightJourney;
  const target = journey ? journey.targetWeightKg ?? null : meta?.targetWeightKg ?? null;
  const startKg = journey ? journey.startingWeightKg ?? null : meta?.startingWeightKg ?? null;
  const startPoint = startKg !== null && meta?.startingAt != null ? { t: meta.startingAt, w: startKg } : null;
  const ready = key !== null && view !== null;
  const cur = key !== null ? fromMonthKey(key) : null;
  const monthLabel = cur ? `${MONTH_NAMES[cur.month]} ${cur.year}` : '';
  const years = Array.from({ length: fromMonthKey(maxKey).year - fromMonthKey(minKey).year + 1 }, (_, i) => fromMonthKey(minKey).year + i);
  const summary = monthPoints.length
    ? `${monthPoints.length} measurement${monthPoints.length === 1 ? '' : 's'}${monthPoints.length > 1 ? ` · ${kgChange(Math.round((monthPoints[0].w - monthPoints[monthPoints.length - 1].w) * 10) / 10)} over the month` : ''}`
    : '';
  const sel = 'border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';
  const navBtn = 'w-11 h-11 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center text-lg';

  return (
    <>
      <section className={card} aria-labelledby="log-weight-title">
        <h2 id="log-weight-title" className={`${heading} mb-4`}>Log your weight</h2>
        <LogWeightForm onSaved={onSaved} />
      </section>

      <section className={card} aria-labelledby="wot-title">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 id="wot-title" className={heading}>Weight over time</h2>
          <div role="group" aria-label="Time range" className="flex rounded-xl border border-slate-200 overflow-hidden text-xs font-medium">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => preset(p.key)} aria-pressed={mode === p.key}
                className={`px-3 py-2 ${mode === p.key ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}>{p.label}</button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mb-3" {...swipe}>
          <button type="button" className={navBtn} onClick={() => key !== null && goMonth(key - 1)} disabled={!ready || key! <= minKey} aria-label="Previous month">‹</button>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="wj-month">Month</label>
            <select id="wj-month" className={sel} disabled={!ready} value={cur?.month ?? 0}
              onChange={(e) => cur && goMonth(cur.year * 12 + Number(e.target.value))}>
              {MONTH_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
            <label className="sr-only" htmlFor="wj-year">Year</label>
            <select id="wj-year" className={sel} disabled={!ready} value={cur?.year ?? 0}
              onChange={(e) => cur && goMonth(Number(e.target.value) * 12 + cur.month)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button type="button" className={navBtn} onClick={() => key !== null && goMonth(key + 1)} disabled={!ready || key! >= maxKey} aria-label="Next month">›</button>
        </div>

        {tl.error && !ready && (
          <div className="rounded-xl bg-danger-50 border border-danger-100 p-4 text-sm text-danger-500">
            {tl.error} <button className="underline font-medium" onClick={tl.retry}>Try again</button>
          </div>
        )}
        {!ready && !tl.error && <div className="h-[250px] sm:h-[320px] rounded-xl bg-slate-50 animate-pulse" role="status" aria-label="Loading your weights" />}
        {ready && (
          <div className="relative">
            <WeightChart points={points} view={view!} bounds={bounds} onViewChange={onChartView} onReset={reset}
              target={target} start={startPoint} selectedId={selectedId} onSelect={setSelectedId} />
            {tl.loading && <p className="absolute left-2 top-0 text-xs text-slate-400" role="status">Loading…</p>}
            {!tl.loading && points.length === 0 && (
              <p className="absolute inset-x-0 top-1/3 text-center text-sm text-slate-400 pointer-events-none">No weights yet — log your first one above.</p>
            )}
            {!tl.loading && points.length > 0 && view && lowerBound(points, view[1] + 1) - lowerBound(points, view[0]) === 0 && (
              <p role="note" className="absolute inset-x-0 top-1/3 text-center text-sm text-slate-400 pointer-events-none">No weights recorded in this period.</p>
            )}
          </div>
        )}
        {tl.error && ready && <p className="text-xs text-danger-500 mt-2">{tl.error} <button className="underline" onClick={tl.retry}>Try again</button></p>}
        {tl.truncated && <p className="text-xs text-slate-400 mt-2">A very long history is shown in part — the most recent entries first.</p>}
      </section>

      <section className={card} aria-labelledby="hist-title" {...swipe}>
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 id="hist-title" className={heading}>Measurements · {monthLabel}</h2>
        </div>
        {summary && <p className="text-xs text-slate-400 mb-3">{summary}</p>}

        {ready && monthPoints.length === 0 && !tl.loading && (
          <p className="text-sm text-slate-400 py-6 text-center">No weights recorded in {monthLabel}.<span className="block text-xs mt-1 md:hidden">Swipe to see other months.</span></p>
        )}
        {!ready && !tl.error && <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>}

        <ul className="divide-y divide-slate-100">
          {monthPoints.map((p) => {
            const fe = p.feeling ? feelingOf(p.feeling) : null;
            const isSel = p.id === selectedId;
            return (
              <li key={p.id} className={`py-3 ${isSel ? 'bg-brand-50/60 -mx-3 px-3 rounded-xl' : ''}`}>
                <button type="button" onClick={() => selectRow(p)} className="w-full text-left" aria-pressed={isSel}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-slate-700">{format(p.t, 'MMM d')} · {format(p.t, 'HH:mm')}</p>
                    {p.changeKg !== null && p.changeKg !== undefined && (
                      <p className={`text-xs ${p.changeKg < 0 ? 'text-brand-700' : 'text-slate-400'}`}>{kgChange(p.changeKg)}</p>
                    )}
                  </div>
                  <p className="text-lg font-semibold text-slate-900">{p.w.toFixed(1)} kg</p>
                </button>
                {p.kind === 'CHECK_IN' && (
                  <p className="text-xs text-slate-500 mt-0.5"><span className="inline-block w-2 h-2 rotate-45 bg-brand-700 mr-1.5" />Monthly check-in{fe ? ` · ${fe.emoji} ${fe.label}` : ''}</p>
                )}
                {p.note && <p className="text-sm text-slate-500 italic mt-1">“{p.note}”</p>}
                {p.kind === 'DAILY' && (
                  confirmId === p.id ? (
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <span className="text-slate-500">Remove this entry?</span>
                      <button type="button" disabled={voiding} onClick={() => remove(p.id)} className="font-medium text-danger-500">{voiding ? 'Removing…' : 'Yes, remove'}</button>
                      <button type="button" onClick={() => setConfirmId(null)} className="text-slate-400">Keep</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setConfirmId(p.id); setVoidError(null); }} className="text-xs text-slate-400 hover:text-slate-600 mt-1">Remove</button>
                  )
                )}
                {voidError && confirmId === p.id && <p className="text-xs text-danger-500 mt-1">{voidError}</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
