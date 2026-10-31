'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { MY_SYMPTOM_ASSESSMENTS, RECORD_MY_SYMPTOMS } from '@/graphql/symptoms';
import type { SymptomAssessment, SymptomScale } from './types';
import { InlineError } from '@/components/common/Alert';
import { Icon } from '@/components/portal/Icon';
import { btnPrimary, btnOutline } from '@/components/portal/Card';

// Picked answers run from calm to warm, so a page of answers reads at a glance. The wording and scores are the
// standard questionnaire's and come from the server unchanged.
const PICKED = ['bg-emerald-600 border-emerald-600', 'bg-lime-600 border-lime-600', 'bg-amber-500 border-amber-500', 'bg-orange-600 border-orange-600', 'bg-rose-600 border-rose-600'];

/**
 * The questionnaire, one group of symptoms per step. Starts from the last answers (when there are any) so a
 * monthly update is only a matter of changing what's different.
 */
export function SymptomForm({ scale, previous, onDone }: { scale: SymptomScale; previous?: SymptomAssessment | null; onDone: () => void }) {
  // Only from an assessment on this same questionnaire — the other scale reuses some item ids.
  const before: Record<string, number> = Object.fromEntries((previous?.scale === scale.id ? previous.answers : []).map((a) => [a.itemId, a.score]));
  const [answers, setAnswers] = useState<Record<string, number>>(before);
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState<unknown>(null);
  const [save, { loading }] = useMutation(RECORD_MY_SYMPTOMS, { refetchQueries: [{ query: MY_SYMPTOM_ASSESSMENTS }], awaitRefetchQueries: true });

  const domain = scale.domains[step];
  const items = scale.items.filter((i) => i.domain === domain.id);
  const last = step === scale.domains.length - 1;
  const answered = scale.items.filter((i) => answers[i.id] !== undefined).length;
  const leftHere = items.filter((i) => answers[i.id] === undefined).length;
  const labelFor = (score: number) => scale.options.find((o) => o.score === score)?.label;

  const next = async (e: React.FormEvent) => {
    e.preventDefault();
    if (leftHere) return setProblem(`Please answer every question on this page (${leftHere} left).`);
    setProblem(null);
    if (!last) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    try {
      await save({ variables: { input: { answers: scale.items.map((i) => ({ itemId: i.id, score: answers[i.id] })) } } });
      onDone();
    } catch (err) {
      setProblem(err);
    }
  };

  return (
    <form onSubmit={next} className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(10,56,54,0.04)] overflow-hidden">
      <div className="px-5 sm:px-8 pt-6 sm:pt-8">
        <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
          <span>Part {step + 1} of {scale.domains.length}</span>
          <span>{answered} of {scale.items.length} answered</span>
        </div>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {scale.domains.map((d, i) => (
            <span key={d.id} className={`h-1.5 flex-1 rounded-full transition-colors ${i < step ? 'bg-ink-600' : i === step ? 'bg-ink-500' : 'bg-slate-100'}`} />
          ))}
        </div>
        <h2 className="mt-6 text-xl font-bold text-ink-900">{domain.label}</h2>
        <p className="mt-1 text-sm text-slate-500">{scale.intro}</p>
      </div>

      <div className="mt-4 divide-y divide-slate-100">
        {items.map((item) => (
          <div key={item.id} role="radiogroup" aria-label={item.text} className="px-5 sm:px-8 py-5">
            <p className="text-[15px] font-medium text-ink-900">{item.text}</p>
            {before[item.id] !== undefined && <p className="mt-0.5 text-xs text-slate-400">Last time: {labelFor(before[item.id])}</p>}
            <div className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-2">
              {scale.options.map((o, i) => {
                const on = answers[item.id] === o.score;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    key={o.score}
                    onClick={() => setAnswers((a) => ({ ...a, [item.id]: o.score }))}
                    className={`min-h-[44px] rounded-xl border px-1 py-2 text-xs sm:text-sm font-medium leading-tight transition-colors ${
                      on ? `${PICKED[i] ?? PICKED[PICKED.length - 1]} text-white` : 'bg-white border-slate-200 text-slate-600 hover:border-ink-500 hover:bg-slate-50'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 sm:px-8 py-5 bg-slate-50/70 border-t border-slate-100" aria-live="polite">
        <InlineError error={problem} className="mb-3" />
        <div className="flex flex-wrap items-center gap-3">
          {step > 0 ? (
            <button type="button" onClick={() => { setProblem(null); setStep((s) => s - 1); }} className={btnOutline}>
              <Icon name="left" className="w-4 h-4" /> Back
            </button>
          ) : (
            <button type="button" onClick={onDone} className="text-sm font-medium text-slate-500 hover:text-slate-700">Cancel</button>
          )}
          <button type="submit" disabled={loading} className={`${btnPrimary} ml-auto px-6`}>
            {last ? (loading ? 'Saving…' : 'Save my answers') : <>Next <Icon name="right" className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </form>
  );
}
