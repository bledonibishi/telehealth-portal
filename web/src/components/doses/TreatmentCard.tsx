'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns';
import { MY_DOSE_SUMMARY } from '@/graphql/dosing';
import { Dialog } from '@/components/common/Dialog';
import { DoseAdherence } from '@/components/dashboard/DoseAdherence';
import { REPORT_SIDE_EFFECTS } from '@/graphql/sideEffects';

const EFFECTS = [
  ['nausea', 'Nausea'], ['vomiting', 'Vomiting'], ['diarrhoea', 'Diarrhoea'], ['constipation', 'Constipation'], ['reflux', 'Heartburn or reflux'],
  ['fatigue', 'Tiredness'], ['headache', 'Headache'], ['dizziness', 'Dizziness'], ['injection_site', 'Reaction where I inject'], ['other', 'Something else'],
] as const;
const SEVERITIES = [
  ['MILD', 'Mild', 'Noticeable, but I’m managing'],
  ['MODERATE', 'Moderate', 'It’s getting in the way of my day'],
  ['SEVERE', 'Severe', 'I’m struggling'],
] as const;

const when = (iso: string) => {
  const d = new Date(iso);
  const day = isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEEE d MMMM');
  return d.getTime() < Date.now() ? `${day} (due ${formatDistanceToNowStrict(d)} ago)` : day;
};

function ReportForm({ onClose }: { onClose: () => void }) {
  const [effects, setEffects] = useState<string[]>([]);
  const [severity, setSeverity] = useState<string>('MILD');
  const [note, setNote] = useState('');
  const [send, { data, loading, error }] = useMutation(REPORT_SIDE_EFFECTS);
  const sent = data?.reportSideEffects;

  const toggle = (key: string) => setEffects((e) => (e.includes(key) ? e.filter((k) => k !== key) : [...e, key]));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!effects.length) return;
    send({ variables: { input: { effects, severity, note: note.trim() || undefined } } }).catch(() => undefined);
  };

  if (sent) {
    return (
      <div role="status">
        <p className="text-sm font-semibold text-slate-900">✓ Your doctor has been told</p>
        <p className="text-xs text-slate-500 mt-1">They’ll look at it and message you if they need to. This doesn’t replace urgent care.</p>
        {sent.advice && <p className="text-sm text-danger-500 bg-danger-50 border border-danger-100 rounded-xl p-3 mt-3">{sent.advice}</p>}
        <button type="button" onClick={onClose} className="text-sm font-medium text-brand-600 hover:text-brand-700 mt-3">Close</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="text-xs font-medium text-slate-500 mb-2">What are you feeling?</legend>
        <div className="flex flex-wrap gap-2">
          {EFFECTS.map(([key, label]) => (
            <button key={key} type="button" role="checkbox" aria-checked={effects.includes(key)} onClick={() => toggle(key)}
              className={`text-sm rounded-full border px-3 py-1.5 ${effects.includes(key) ? 'bg-brand-50 border-brand-500 text-brand-700 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-medium text-slate-500 mb-2">How much is it affecting you?</legend>
        <div className="grid sm:grid-cols-3 gap-2">
          {SEVERITIES.map(([key, label, hint]) => (
            <label key={key} className={`rounded-xl border p-3 cursor-pointer text-sm ${severity === key ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="severity" value={key} checked={severity === key} onChange={() => setSeverity(key)} className="sr-only" />
              <span className="block font-medium text-slate-900">{label}</span>
              <span className="block text-xs text-slate-500">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {severity === 'SEVERE' && (
        <p className="text-sm text-danger-500 bg-danger-50 border border-danger-100 rounded-xl p-3">
          If you have severe stomach pain, can’t keep fluids down, or feel very unwell, call 112 or go to your nearest emergency department now — don’t wait for a reply.
        </p>
      )}

      <div>
        <label htmlFor="se-note" className="block text-xs font-medium text-slate-500 mb-1">Anything else? (optional)</label>
        <textarea id="se-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {error && <p role="alert" className="text-sm text-danger-500">{error.message}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading || !effects.length} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
          {loading ? 'Sending…' : 'Tell my doctor'}
        </button>
        <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
      </div>
    </form>
  );
}

const STAGES = ['Prescribed', 'Dispatched', 'On its way', 'Delivered'] as const;
const STAGE_OF: Record<string, number> = { PENDING: 0, DISPATCHED: 1, OUT_FOR_DELIVERY: 2, DELIVERED: 3 };

/** Four dots and one line: where the current supply is. */
function OrderLine({ order }: { order: any }) {
  const current = STAGE_OF[order.status] ?? 0;
  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs text-slate-500">
          <b className="text-slate-700">{order.sequence === 1 ? 'First supply' : `Repeat ${order.sequence - 1}`}</b>
          {order.dispatchedAt && ` · sent ${format(new Date(order.dispatchedAt), 'd MMM')}`}
        </p>
        <div className="flex items-center gap-3 flex-shrink-0">
          {order.trackingUrl && <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:text-brand-700">Track →</a>}
          <Link href="/prescription" className="text-xs font-medium text-brand-600 hover:text-brand-700">Details →</Link>
        </div>
      </div>
      <ol className="flex items-center" aria-label="Order progress">
        {STAGES.map((stage, i) => (
          <li key={stage} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <span className={`w-2.5 h-2.5 rounded-full ${i <= current ? 'bg-brand-600' : 'bg-slate-200'} ${i === current ? 'ring-4 ring-brand-100' : ''}`} />
              <span className={`text-[10px] mt-1 whitespace-nowrap ${i <= current ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>{stage}</span>
            </div>
            {i < STAGES.length - 1 && <span className={`h-0.5 flex-1 mx-1 mb-3.5 ${i < current ? 'bg-brand-600' : 'bg-slate-200'}`} />}
          </li>
        ))}
      </ol>
      {typeof order.prescription?.repeatsRemaining === 'number' && order.prescription.repeatsRemaining > 0 && (
        <p className="text-[11px] text-slate-400 mt-2">{order.prescription.repeatsRemaining} repeat{order.prescription.repeatsRemaining === 1 ? '' : 's'} left on this prescription</p>
      )}
    </div>
  );
}

/** Your medicine in one place: the dose, the next injection, how to report a side effect, and where the supply is. */
export function TreatmentCard({ order }: { order?: any | null }) {
  const { data } = useQuery(MY_DOSE_SUMMARY, { fetchPolicy: 'cache-and-network' });
  const [reporting, setReporting] = useState(false);
  const dose = data?.myDoseSummary;
  if (!dose && !order) return null;

  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5" aria-labelledby="treatment-title">
      <div className="flex items-center justify-between mb-3">
        <h2 id="treatment-title" className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Your treatment</h2>
        {dose && <Link href="/doses" className="text-xs font-medium text-brand-600 hover:text-brand-700">Dose calendar →</Link>}
      </div>

      {dose && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 leading-tight">{dose.current}</p>
            <p className="text-sm text-slate-500 mt-0.5">
              {dose.nextDoseAt ? <>Next dose: <b className="text-slate-700">{when(dose.nextDoseAt)}</b></> : 'Your next dose will show here once it’s scheduled.'}
            </p>
          </div>
          <button type="button" onClick={() => setReporting(true)} className="border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium px-3 py-2 rounded-lg">
            Report a side effect
          </button>
        </div>
      )}

      {dose && <DoseAdherence />}
      {order && <OrderLine order={order} />}

      {reporting && (
        <Dialog title="Report a side effect" onClose={() => setReporting(false)}>
          <ReportForm onClose={() => setReporting(false)} />
        </Dialog>
      )}
    </section>
  );
}
