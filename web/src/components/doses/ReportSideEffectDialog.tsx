'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { REPORT_SIDE_EFFECTS } from '@/graphql/sideEffects';
import { Dialog } from '@/components/common/Dialog';

const EFFECTS = [
  ['nausea', 'Nausea'], ['vomiting', 'Vomiting'], ['abdominal_pain', 'Stomach pain'], ['diarrhoea', 'Diarrhoea'], ['constipation', 'Constipation'], ['reflux', 'Heartburn or reflux'],
  ['fatigue', 'Tiredness'], ['headache', 'Headache'], ['dizziness', 'Dizziness'], ['injection_site', 'Reaction where I inject'], ['allergic_reaction', 'Rash, itching or swelling'], ['other', 'Something else'],
] as const;
/** Same keys as SIDE_EFFECTS in backend/src/side-effects/side-effects.ts. */
export const EFFECT_LABEL: Record<string, string> = Object.fromEntries(EFFECTS);
const SEVERITIES = [
  ['MILD', 'Mild', 'Noticeable, but I’m managing'],
  ['MODERATE', 'Moderate', 'It’s getting in the way of my day'],
  ['SEVERE', 'Severe', 'I’m struggling'],
] as const;

function ReportForm({ onClose }: { onClose: () => void }) {
  const [effects, setEffects] = useState<string[]>([]);
  const [severity, setSeverity] = useState<string>('MILD');
  const [note, setNote] = useState('');
  const [send, { data, loading, error }] = useMutation(REPORT_SIDE_EFFECTS, { refetchQueries: ['MySideEffectReports'] });
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

      {effects.includes('allergic_reaction') && (
        <p className="text-sm text-danger-500 bg-danger-50 border border-danger-100 rounded-xl p-3">
          Swelling of your face, lips or throat, or trouble breathing, is an emergency: call 112 now. Don’t take another dose until a doctor has told you to.
        </p>
      )}

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

/** Tell the doctor about a side effect, from anywhere on the dashboard. Opens as a panel over the page. */
export function ReportSideEffectDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Report a side effect" onClose={onClose}>
      <ReportForm onClose={onClose} />
    </Dialog>
  );
}
