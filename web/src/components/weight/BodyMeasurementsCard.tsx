'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { ADD_MY_BODY_MEASUREMENT, MY_BODY_MEASUREMENTS, VOID_MY_BODY_MEASUREMENT } from '@/graphql/weight';
import { cmChange, MEASURE_COLORS, MEASURES, seriesOf, summariseMeasurements, type BodyMeasurement } from '@/lib/body-measurements';
import { Card, CardHeader } from '@/components/portal/Card';
import { Dialog } from '@/components/common/Dialog';

const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const field = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';

/** Fill in any of the three; leave the rest empty. A retry of one submission is recorded once. */
function MeasurementForm({ onDone }: { onDone: () => void }) {
  const [values, setValues] = useState({ waistCm: '', hipsCm: '', armCm: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const requestId = useRef(newRequestId());
  const [save, { loading }] = useMutation(ADD_MY_BODY_MEASUREMENT, {
    update: (cache, { data }) => cache.writeQuery({ query: MY_BODY_MEASUREMENTS, data: { myBodyMeasurements: data.addMyBodyMeasurement } }),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: Record<string, number | string> = { clientRequestId: requestId.current };
    for (const m of MEASURES) {
      const raw = values[m.key].trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < m.min || n > m.max) return setProblem(`Please enter a ${m.label.toLowerCase()} between ${m.min} and ${m.max} cm.`);
      input[m.key] = n;
    }
    if (Object.keys(input).length === 1) return setProblem('Enter at least one measurement.');
    setProblem(null);
    try {
      await save({ variables: { input } });
      onDone();
    } catch (err: any) {
      setProblem(err?.message ?? 'Couldn’t save that. Please try again.');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid sm:grid-cols-3 gap-3">
        {MEASURES.map((m) => (
          <div key={m.key}>
            <label htmlFor={`bm-${m.key}`} className="block text-xs font-medium text-slate-500 mb-1">{m.label} (cm)</label>
            <input id={`bm-${m.key}`} type="number" inputMode="decimal" step="0.1" min={m.min} max={m.max} value={values[m.key]}
              onChange={(e) => setValues({ ...values, [m.key]: e.target.value })} className={field} autoComplete="off" aria-describedby={`bm-${m.key}-hint`} />
            <p id={`bm-${m.key}-hint`} className="text-[11px] text-slate-400 mt-1">{m.hint}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">Measure at the same time of day each time, on bare skin, without pulling the tape tight.</p>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-3 rounded-xl">{loading ? 'Saving…' : 'Save measurements'}</button>
        <button type="button" onClick={onDone} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
      </div>
      {problem && <p className="text-sm text-danger-500" role="alert">{problem}</p>}
    </form>
  );
}

/** The trend of one measure as a small line under its number: the shape only, no axes. */
function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  if (values.length < 2) return <p className="text-[11px] text-slate-300 mt-1.5 h-7">Trend after 2 entries</p>;
  const W = 120, H = 28, PAD = 3;
  const lo = Math.min(...values), hi = Math.max(...values);
  const x = (i: number) => PAD + (i / (values.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => (hi === lo ? H / 2 : PAD + ((hi - v) / (hi - lo)) * (H - 2 * PAD));
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[9rem] h-7 mt-1.5" role="img" aria-label={`${label} trend: from ${values[0]} to ${values[values.length - 1]} cm over ${values.length} entries`}>
      <path d={`${line}L${x(values.length - 1).toFixed(1)},${H}L${x(0).toFixed(1)},${H}Z`} fill={color} opacity="0.08" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="wj-draw" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" fill={color} />
    </svg>
  );
}

/** Waist, hips and arm over time: fat loss the scale alone doesn't show. */
export function BodyMeasurementsCard() {
  const { data, loading, error } = useQuery(MY_BODY_MEASUREMENTS, { fetchPolicy: 'cache-and-network' });
  const [logging, setLogging] = useState(false);
  const [remove, { loading: removing, error: removeError }] = useMutation(VOID_MY_BODY_MEASUREMENT, {
    update: (cache, { data }) => cache.writeQuery({ query: MY_BODY_MEASUREMENTS, data: { myBodyMeasurements: data.voidMyBodyMeasurement } }),
  });
  const list: BodyMeasurement[] = data?.myBodyMeasurements ?? [];
  const summary = summariseMeasurements(list);

  return (
    <Card labelledBy="body-measurements-title">
      <CardHeader id="body-measurements-title" title="Body measurements" subtitle="Waist, hips and arm — progress the scale doesn’t show.">
        <button type="button" onClick={() => setLogging(true)} className="flex-shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700">+ Add measurements</button>
      </CardHeader>

      {loading && !data && <p className="text-sm text-slate-400">Loading…</p>}
      {error && !data && <p className="text-sm text-danger-500">{error.message}</p>}

      {data && list.length === 0 && (
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <p className="text-sm text-slate-500">Take your waist, hips and arm measurements to see the inches come off, even when the scale moves slowly.</p>
          <button type="button" onClick={() => setLogging(true)} className="mt-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Add your first measurements</button>
        </div>
      )}

      {summary.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {MEASURES.map((m) => {
              const s = summary.find((x) => x.key === m.key);
              return (
                <div key={m.key} className="min-w-0">
                  <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full" style={{ background: MEASURE_COLORS[m.key] }} aria-hidden />{m.label}</p>
                  <p className="text-lg font-semibold text-slate-900">{s ? `${s.latestCm} cm` : '—'}</p>
                  {s && s.changeCm !== null && <p className={`text-xs font-medium ${s.changeCm < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{cmChange(s.changeCm)} since you started</p>}
                  {s && <Sparkline values={seriesOf(list, m.key).map((p) => p.cm)} color={MEASURE_COLORS[m.key]} label={m.label} />}
                </div>
              );
            })}
          </div>

          <details className="mt-4 group">
            <summary className="text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700">History ({list.length})</summary>
            <ul className="mt-2 divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1">
              {list.map((m) => (
                <li key={m.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500 w-28 flex-shrink-0">{format(new Date(m.measuredAt), 'd MMM yyyy')}</span>
                  <span className="flex-1 text-slate-700">
                    {MEASURES.filter((x) => m[x.key] !== null).map((x) => `${x.label} ${m[x.key]}`).join(' · ')} cm
                  </span>
                  <button type="button" disabled={removing} onClick={() => remove({ variables: { id: m.id } })} className="text-slate-400 hover:text-danger-500 disabled:opacity-50" aria-label={`Remove the entry from ${format(new Date(m.measuredAt), 'd MMM yyyy')}`}>Remove</button>
                </li>
              ))}
            </ul>
            {removeError && <p className="text-xs text-danger-500 mt-1">{removeError.message}</p>}
          </details>
        </>
      )}

      {logging && (
        <Dialog title="Add your measurements" onClose={() => setLogging(false)}>
          <MeasurementForm onDone={() => setLogging(false)} />
        </Dialog>
      )}
    </Card>
  );
}
