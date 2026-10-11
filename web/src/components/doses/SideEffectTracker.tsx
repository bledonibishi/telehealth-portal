'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_PRODUCT_KIND } from '@/graphql/intake';
import { LOG_MY_SIDE_EFFECT_SCORES, MY_SIDE_EFFECT_SCORES } from '@/graphql/sideEffects';
import { describeScore, HIGH_SCORE, isScoreCheckDue, SCORES, type ScoreEntry, type ScoreKey } from '@/lib/side-effect-scores';
import { Dialog } from '@/components/common/Dialog';
import { Card, CardHeader } from '@/components/portal/Card';
import { InlineError } from '@/components/common/Alert';

const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
/** The scores are the weight-loss medicines' usual side effects, so they are only asked of those patients. */
const useIsGlp1 = () => {
  const { data } = useQuery(MY_PRODUCT_KIND, { fetchPolicy: 'cache-first' });
  return data?.myProductKind === 'GLP1';
};

const blank = (): Record<ScoreKey, number> => ({ nausea: 1, vomiting: 1, abdominalPain: 1, diarrhoea: 1, constipation: 1, fatigue: 1 });

function ScoresForm({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState(blank);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<unknown>(null);
  const requestId = useRef(newRequestId());
  const [save, { data, loading }] = useMutation(LOG_MY_SIDE_EFFECT_SCORES, { refetchQueries: [{ query: MY_SIDE_EFFECT_SCORES }, 'MySideEffectReports'] });
  const saved = data?.logMySideEffectScores;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    try {
      await save({ variables: { input: { ...values, note: note.trim() || undefined, clientRequestId: requestId.current } } });
    } catch (err: any) {
      setProblem(err);
    }
  };

  if (saved) {
    const high = SCORES.filter((s) => saved[s.key] >= HIGH_SCORE);
    return (
      <div role="status">
        <p className="text-sm font-semibold text-slate-900">✓ Saved — your doctor can see this</p>
        <p className="text-xs text-slate-500 mt-1">They look at your scores before they approve your next dose or supply.</p>
        {high.length > 0 && <p className="text-xs text-slate-600 mt-2">You marked {high.map((s) => s.label.toLowerCase()).join(' and ')} as strong, so your doctor has been alerted as well.</p>}
        {saved.advice && <p className="text-sm text-danger-500 bg-danger-50 border border-danger-100 rounded-md p-3 mt-3">{saved.advice}</p>}
        <button type="button" onClick={onClose} className="text-sm font-medium text-brand-600 hover:text-brand-700 mt-3">Close</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-slate-500">Over the last week, how strong was each of these? <b className="text-slate-700">1 means none, 10 means the worst you can imagine.</b></p>
      {SCORES.map((s) => (
        <div key={s.key}>
          <div className="flex items-baseline justify-between">
            <label htmlFor={`score-${s.key}`} className="text-sm font-medium text-slate-900">{s.label}</label>
            <span className={`text-sm font-semibold ${values[s.key] >= HIGH_SCORE ? 'text-danger-500' : 'text-slate-700'}`}>{values[s.key]} <span className="text-xs font-normal text-slate-400">· {describeScore(values[s.key])}</span></span>
          </div>
          <input id={`score-${s.key}`} type="range" min={1} max={10} step={1} value={values[s.key]}
            onChange={(e) => setValues({ ...values, [s.key]: Number(e.target.value) })}
            aria-valuetext={`${values[s.key]} out of 10, ${describeScore(values[s.key])}`} className="w-full accent-brand-600" />
        </div>
      ))}
      <div>
        <label htmlFor="score-note" className="block text-xs font-medium text-slate-500 mb-1">Anything else? (optional)</label>
        <textarea id="score-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
          className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>
      <InlineError error={problem} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-md">{loading ? 'Saving…' : 'Save this week'}</button>
        <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
      </div>
      <p className="text-xs text-slate-400">This isn’t for emergencies. For severe stomach pain, trouble breathing or swelling of the face or throat, call 112.</p>
    </form>
  );
}

export function SideEffectScoresDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="How have you been this week?" onClose={onClose}>
      <ScoresForm onClose={onClose} />
    </Dialog>
  );
}

/** A nudge on the page, shown only once the weekly check is due. */
export function WeeklySideEffectPrompt() {
  const glp1 = useIsGlp1();
  const { data } = useQuery(MY_SIDE_EFFECT_SCORES, { fetchPolicy: 'cache-and-network', skip: !glp1 });
  const [open, setOpen] = useState(false);
  if (!glp1 || !data || !isScoreCheckDue(data.mySideEffectScores)) return null;
  return (
    <div className="bg-white rounded-lg border border-slate-100 p-5 mb-6 flex flex-wrap items-center justify-between gap-3" role="region" aria-label="Weekly side-effect check">
      <div>
        <p className="text-sm font-semibold text-slate-900">How have you been this week?</p>
        <p className="text-xs text-slate-500 mt-0.5">A one-minute check on side effects. Your doctor reads it before approving your next dose.</p>
      </div>
      <button type="button" onClick={() => setOpen(true)} className="flex-shrink-0 bg-ink-700 hover:bg-ink-800 text-white text-sm font-semibold px-4 py-2.5 rounded-md">Log this week</button>
      {open && <SideEffectScoresDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The weekly scores and how they have moved, with the button to add this week's. */
export function WeeklySideEffectCard() {
  const glp1 = useIsGlp1();
  const { data } = useQuery(MY_SIDE_EFFECT_SCORES, { fetchPolicy: 'cache-and-network', skip: !glp1 });
  const [open, setOpen] = useState(false);
  const entries: ScoreEntry[] = data?.mySideEffectScores ?? [];
  const due = data ? isScoreCheckDue(entries) : false;
  const latest = entries[0];
  const previous = entries[1];
  if (!glp1) return null;

  return (
    <Card labelledBy="weekly-se-title">
      <CardHeader id="weekly-se-title" title="Weekly side-effect check" subtitle="Score how you feel each week. Your doctor reads it before approving your next dose.">
        <button type="button" onClick={() => setOpen(true)} className={`flex-shrink-0 text-xs font-semibold rounded-lg px-3 py-1.5 ${due ? 'bg-ink-700 hover:bg-ink-800 text-white' : 'text-ink-700 border border-ink-600/40 hover:bg-ink-50'}`}>{due ? 'Log this week' : 'Log again'}</button>
      </CardHeader>

      {data && !latest && <p className="text-sm text-slate-500">You haven’t logged yet. It takes a minute, and it helps your doctor choose the right dose for you.</p>}
      {latest && (
        <>
          <p className="text-xs text-slate-500 mb-2">Last logged {format(new Date(latest.recordedAt), 'd MMM yyyy')}{due ? ' · time for this week’s' : ''}</p>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {SCORES.map((s) => {
              const now = latest[s.key];
              const was = previous?.[s.key];
              return (
                <li key={s.key} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{s.label}</span>
                  <span className={`font-semibold ${now >= HIGH_SCORE ? 'text-danger-500' : 'text-slate-800'}`}>
                    {now}/10
                    {was !== undefined && was !== now && <span className={`ml-1.5 text-xs font-medium ${now < was ? 'text-emerald-700' : 'text-amber-700'}`}>{now < was ? '↓' : '↑'} from {was}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {open && <SideEffectScoresDialog onClose={() => setOpen(false)} />}
    </Card>
  );
}
