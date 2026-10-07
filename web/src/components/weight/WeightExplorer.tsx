'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_WEIGHT_FORECAST, MY_WEIGHT_JOURNEY, VOID_MY_WEIGHT } from '@/graphql/weight';
import { useWeightTimeline } from '@/lib/useWeightTimeline';
import { fromMonthKey, lowerBound, monthEnd, monthKey, monthStart, panBy, Point, View } from '@/lib/timeseries';
import { feelingOf, kg, kgChange } from '@/lib/weight';
import { WeightChart } from './WeightChart';
import { LogWeightForm } from './LogWeightForm';
import { Dialog } from '@/components/common/Dialog';

type Mode = 'month' | '3M' | '6M' | '1Y' | 'All' | 'custom';
const PRESETS: { key: Exclude<Mode, 'custom'>; label: string }[] = [
  { key: 'month', label: 'Month' }, { key: '3M', label: '3M' }, { key: '6M', label: '6M' }, { key: '1Y', label: '1Y' }, { key: 'All', label: 'All' },
];
const MONTHS_BACK: Record<string, number> = { month: 0, '3M': 2, '6M': 5, '1Y': 11 };
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const card = 'bg-white rounded-2xl border border-slate-100 p-4 sm:p-5';
const DAY = 86_400_000;

export interface ExtraTab { key: string; label: string; node: React.ReactNode }

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

/** The chart, the month-by-month list and any extra tabs the page adds (photos, check-ins), in one card so nothing sits far down the page. */
export function WeightExplorer({ extraTabs = [] }: { extraTabs?: ExtraTab[] }) {
  const tl = useWeightTimeline();
  const { points, meta } = tl;
  const nowMs = useRef(Date.now()).current;

  const [key, setKey] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('3M');
  const [view, setView] = useState<View | null>(null);
  const [tab, setTab] = useState<string>('chart');
  const [logging, setLogging] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidWeight, { loading: voiding }] = useMutation(VOID_MY_WEIGHT, { refetchQueries: [{ query: MY_WEIGHT_JOURNEY }] });

  const { data: forecastData } = useQuery(MY_WEIGHT_FORECAST, { fetchPolicy: 'cache-and-network' });
  const fc = forecastData?.myWeightForecast;
  const forecast = useMemo(
    () => (fc?.available
      ? {
          from: { t: Date.parse(fc.fromAt), w: fc.fromWeightKg as number },
          points: (fc.points as Array<{ at: string; monthsAhead: number; weightKg: number }>).map((p) => ({ t: Date.parse(p.at), w: p.weightKg, m: p.monthsAhead })),
        }
      : null),
    [fc],
  );
  const forecastEnd = forecast ? forecast.points[forecast.points.length - 1].t : null;

  // Navigation limits: from the first measurement (or the intake) to the current month.
  const baseBounds: View = useMemo(() => {
    const earliest = Math.min(...[meta?.earliestAt, meta?.startingAt].filter((v): v is number => typeof v === 'number'), nowMs - 30 * 86_400_000);
    const first = fromMonthKey(monthKey(earliest));
    const last = fromMonthKey(monthKey(Math.max(nowMs, meta?.latestAt ?? 0)));
    return [monthStart(first.year, first.month), monthEnd(last.year, last.month)];
  }, [meta, nowMs]);
  // With the projection showing, the chart may also pan out to the end of it.
  const bounds: View = useMemo(() => (showForecast && forecastEnd ? [baseBounds[0], Math.max(baseBounds[1], forecastEnd + 10 * DAY)] : baseBounds), [baseBounds, showForecast, forecastEnd]);
  const minKey = monthKey(baseBounds[0]);
  const maxKey = monthKey(baseBounds[1]);
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
    setShowForecast(false);
    setKey(next); setMode(m); setView(viewFor(m, next)); setSelectedId(null); setConfirmId(null);
  }, [clampKey, mode, viewFor]);
  const preset = (m: Exclude<Mode, 'custom'>) => { if (key === null) return; setShowForecast(false); setMode(m); setView(viewFor(m, key)); };
  const toggleForecast = () => {
    if (!forecast || forecastEnd === null) return;
    if (showForecast) { setShowForecast(false); preset('3M'); return; }
    // The last three months of real weights, then the projection to its end.
    setShowForecast(true);
    setMode('custom');
    setView([Math.max(baseBounds[0], nowMs - 90 * DAY), forecastEnd + 10 * DAY]);
  };
  const onChartView = useCallback((v: View) => { setView(v); setMode('custom'); setKey(clampKey(monthKey(v[1] - 1))); }, [clampKey]);
  const reset = () => (showForecast ? toggleForecast() : preset(mode === 'custom' ? '3M' : mode));
  const swipe = useSwipe(() => key !== null && goMonth(key - 1), () => key !== null && goMonth(key + 1));

  const monthPoints = useMemo(() => {
    if (key === null) return [] as Point[];
    const { year, month } = fromMonthKey(key);
    const a = monthStart(year, month), b = monthEnd(year, month);
    return points.filter((p) => p.t >= a && p.t <= b).reverse(); // newest first
  }, [points, key]);

  const onSaved = useCallback(async (at: number) => {
    setLogging(false);
    setShowForecast(false);
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

  const tabs: ExtraTab[] = [
    { key: 'chart', label: 'Chart', node: null },
    { key: 'history', label: `Weighings${monthPoints.length ? ` · ${monthPoints.length}` : ''}`, node: null },
    ...extraTabs,
  ];
  const tabBtn = (active: boolean) => `px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${active ? 'border-brand-600 text-brand-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`;

  return (
    <section className={card} aria-label="Your weight">
      <div className="flex items-end justify-between gap-3 border-b border-slate-100 mb-3">
        <div role="tablist" aria-label="Weight sections" className="flex overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={tabBtn(tab === t.key)}>{t.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => setLogging(true)} className="mb-1.5 flex-shrink-0 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-2 rounded-lg">+ Log weight</button>
      </div>

      {logging && (
        <Dialog title="Log your weight" onClose={() => setLogging(false)}>
          <LogWeightForm onSaved={onSaved} onCancel={() => setLogging(false)} />
        </Dialog>
      )}

      {tab === 'chart' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div role="group" aria-label="Time range" className="flex rounded-xl border border-slate-200 overflow-hidden text-xs font-medium">
              {PRESETS.map((p) => (
                <button key={p.key} type="button" onClick={() => preset(p.key)} aria-pressed={!showForecast && mode === p.key}
                  className={`px-3 py-1.5 ${!showForecast && mode === p.key ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}>{p.label}</button>
              ))}
            </div>
            {forecast && (
              <button type="button" onClick={toggleForecast} aria-pressed={showForecast}
                className={`text-xs font-medium rounded-xl border px-3 py-1.5 ${showForecast ? 'bg-brand-50 border-brand-500 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {showForecast ? '✓ ' : ''}Show projection
              </button>
            )}
          </div>

          {tl.error && !ready && (
            <div className="rounded-xl bg-danger-50 border border-danger-100 p-4 text-sm text-danger-500">
              {tl.error} <button className="underline font-medium" onClick={tl.retry}>Try again</button>
            </div>
          )}
          {!ready && !tl.error && <div className="h-[220px] sm:h-[260px] rounded-xl bg-slate-50 animate-pulse" role="status" aria-label="Loading your weights" />}
          {ready && (
            <div className="relative">
              <WeightChart points={points} view={view!} bounds={bounds} onViewChange={onChartView} onReset={reset}
                target={target} start={startPoint} selectedId={selectedId} onSelect={setSelectedId} forecast={showForecast ? forecast : null} />
              {tl.loading && <p className="absolute left-2 top-0 text-xs text-slate-400" role="status">Loading…</p>}
              {!tl.loading && points.length === 0 && (
                <div className="absolute inset-x-0 top-1/4 flex flex-col items-center gap-3 px-4 text-center pointer-events-none">
                  <p className="text-sm text-slate-500">🎯 Log your first weight to start tracking your progress.</p>
                  <button type="button" onClick={() => setLogging(true)} className="pointer-events-auto bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Log your weight now</button>
                </div>
              )}
              {!tl.loading && points.length > 0 && view && lowerBound(points, view[1] + 1) - lowerBound(points, view[0]) === 0 && !showForecast && (
                <p role="note" className="absolute inset-x-0 top-1/3 text-center text-sm text-slate-400 pointer-events-none">No weights recorded in this period.</p>
              )}
            </div>
          )}
          {tl.error && ready && <p className="text-xs text-danger-500 mt-2">{tl.error} <button className="underline" onClick={tl.retry}>Try again</button></p>}
          {tl.truncated && <p className="text-xs text-slate-400 mt-2">A very long history is shown in part — the most recent entries first.</p>}

          {fc && (
            <p className="text-xs text-slate-500 mt-2">
              {fc.available ? (
                <>
                  <b className="text-slate-700">At about {Math.abs(fc.kgPerWeek).toFixed(1)} kg a week</b>
                  {' '}→ {fc.points.find((p: any) => p.monthsAhead === 3) && <>≈ {fc.points.find((p: any) => p.monthsAhead === 3).weightKg} kg in 3 months</>}
                  {fc.points.find((p: any) => p.monthsAhead === 6) && <>, ≈ {fc.points.find((p: any) => p.monthsAhead === 6).weightKg} kg in 6 months</>}
                  {fc.reachesTargetAt && <>; target around {format(new Date(fc.reachesTargetAt), 'MMM yyyy')}</>}.
                  {' '}<span className="text-slate-400">A straight-line estimate from {fc.basedOnPoints} weigh-ins{fc.confidence === 'LOW' ? ' (rough)' : ''} — not a promise or medical advice.</span>
                </>
              ) : (
                <span className="text-slate-400">
                  {fc.reason === 'NOT_LOSING' ? 'No downward trend in your recent weights yet, so no projection.'
                    : fc.reason === 'TOO_VARIABLE' ? 'Your recent weights vary too much to project — keep logging and one will appear.'
                    : 'Log your weight a few times over two weeks to see a projection.'}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div {...swipe}>
          <div className="flex items-center justify-between gap-2 mb-2">
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
          {summary && <p className="text-xs text-slate-400 mb-2">{summary}</p>}

          {ready && monthPoints.length === 0 && !tl.loading && (
            <p className="text-sm text-slate-400 py-6 text-center">No weights recorded in {monthLabel}.<span className="block text-xs mt-1 md:hidden">Swipe to see other months.</span></p>
          )}
          {!ready && !tl.error && <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>}

          <ul className="divide-y divide-slate-100 max-h-[19rem] overflow-y-auto pr-1">
            {monthPoints.map((p) => {
              const fe = p.feeling ? feelingOf(p.feeling) : null;
              const isSel = p.id === selectedId;
              return (
                <li key={p.id} className={`py-2.5 ${isSel ? 'bg-brand-50/60 -mx-3 px-3 rounded-xl' : ''}`}>
                  <button type="button" onClick={() => selectRow(p)} className="w-full text-left" aria-pressed={isSel}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium text-slate-700">{format(p.t, 'MMM d')} · {format(p.t, 'HH:mm')}</p>
                      {p.changeKg !== null && p.changeKg !== undefined && (
                        <p className={`text-xs ${p.changeKg < 0 ? 'text-brand-700' : 'text-slate-400'}`}>{kgChange(p.changeKg)}</p>
                      )}
                    </div>
                    <p className="text-base font-semibold text-slate-900">{p.w.toFixed(1)} kg{p.hasPhoto && <span className="ml-2 text-sm" role="img" aria-label="Has a progress photo" title="Has a progress photo">📷</span>}</p>
                  </button>
                  {p.kind === 'CHECK_IN' && (
                    <p className="text-xs text-slate-500 mt-0.5"><span className="inline-block w-2 h-2 rotate-45 bg-brand-700 mr-1.5" />Check-in{fe ? ` · ${fe.emoji} ${fe.label}` : ''}</p>
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
        </div>
      )}

      {extraTabs.map((t) => tab === t.key && <div key={t.key}>{t.node}</div>)}
    </section>
  );
}
