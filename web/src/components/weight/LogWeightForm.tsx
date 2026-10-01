'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@apollo/client';
import { format } from 'date-fns';
import { ADD_MY_WEIGHT, MY_WEIGHT_JOURNEY } from '@/graphql/weight';

const MIN_KG = 30;
const MAX_KG = 300;

/** `datetime-local` wants "yyyy-MM-ddTHH:mm" in the browser's own time zone. */
const nowLocal = () => format(new Date(), "yyyy-MM-dd'T'HH:mm");
const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Record a weight now or at any past date and time. Every save is a new entry — earlier ones are
 * never touched. The request id stays the same across retries of one submission, so a double tap
 * or a flaky connection can't record the same weighing twice.
 */
export function LogWeightForm({ onSaved, onCancel, compact = false }: { onSaved?: (measuredAt: number) => void; onCancel?: () => void; compact?: boolean }) {
  const [weight, setWeight] = useState('');
  const [when, setWhen] = useState(nowLocal);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const requestId = useRef(newRequestId());
  const [save, { loading }] = useMutation(ADD_MY_WEIGHT, { refetchQueries: [{ query: MY_WEIGHT_JOURNEY }], awaitRefetchQueries: true });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(null);
    const kgValue = Number(weight);
    const at = new Date(when);
    if (!weight.trim() || !Number.isFinite(kgValue)) return setProblem('Please enter your weight.');
    if (kgValue < MIN_KG || kgValue > MAX_KG) return setProblem(`Please enter a weight between ${MIN_KG} and ${MAX_KG} kg.`);
    if (!when || Number.isNaN(at.getTime())) return setProblem('Please choose a date and time.');
    if (at.getTime() > Date.now() + 5 * 60_000) return setProblem('The date and time can’t be in the future.');
    setProblem(null);
    try {
      await save({ variables: { input: { weightKg: kgValue, measuredAt: at.toISOString(), note: note.trim() || undefined, clientRequestId: requestId.current } } });
      setSaved(`Saved ${kgValue.toFixed(1)} kg · ${format(at, 'MMM d, HH:mm')}`);
      setWeight(''); setNote(''); setShowNote(false); setWhen(nowLocal());
      requestId.current = newRequestId(); // the next weighing is a new one
      onSaved?.(at.getTime());
    } catch (err: any) {
      setProblem(err?.message ?? 'Couldn’t save that. Please try again.');
    }
  };

  const field = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className={compact ? 'grid grid-cols-[7rem_1fr] gap-2' : 'grid sm:grid-cols-[9rem_1fr] gap-3'}>
        <div>
          <label htmlFor="log-weight" className="block text-xs font-medium text-slate-500 mb-1">Weight (kg)</label>
          <input id="log-weight" type="number" inputMode="decimal" step="0.1" min={MIN_KG} max={MAX_KG} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 109.4" className={field} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="log-when" className="block text-xs font-medium text-slate-500 mb-1">Date and time</label>
          <input id="log-when" type="datetime-local" value={when} max={nowLocal()} onChange={(e) => setWhen(e.target.value)} className={field} />
        </div>
      </div>

      {showNote ? (
        <div>
          <label htmlFor="log-note" className="block text-xs font-medium text-slate-500 mb-1">Note (optional)</label>
          <textarea id="log-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </div>
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="text-xs font-medium text-brand-600 hover:text-brand-700">+ Add a note</button>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-3 rounded-xl">
          {loading ? 'Saving…' : 'Save weight'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-600">Close</button>}
      </div>
      <div aria-live="polite">
        {problem && <p className="text-sm text-danger-500">{problem}</p>}
        {saved && <p className="text-sm text-brand-700">✓ {saved}</p>}
      </div>
    </form>
  );
}
