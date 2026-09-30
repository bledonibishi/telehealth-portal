'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { MY_SYMPTOM_ASSESSMENTS, RECORD_MY_SYMPTOMS } from '@/graphql/symptoms';
import type { SymptomAssessment, SymptomScale } from './types';

/**
 * The full questionnaire, one row per symptom. Starts from the last answers (when there are any) so a
 * monthly update is only a matter of changing what's different.
 */
export function SymptomForm({ scale, previous, onDone }: { scale: SymptomScale; previous?: SymptomAssessment | null; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>(() =>
    // Only from an assessment on this same questionnaire — the other scale reuses some item ids.
    Object.fromEntries((previous?.scale === scale.id ? previous.answers : []).map((a) => [a.itemId, a.score])),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [save, { loading }] = useMutation(RECORD_MY_SYMPTOMS, { refetchQueries: [{ query: MY_SYMPTOM_ASSESSMENTS }], awaitRefetchQueries: true });

  const left = scale.items.filter((i) => answers[i.id] === undefined).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (left) return setProblem(`Please answer every question (${left} left).`);
    setProblem(null);
    try {
      await save({ variables: { input: { answers: scale.items.map((i) => ({ itemId: i.id, score: answers[i.id] })) } } });
      onDone();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Something went wrong — please try again.');
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-6 mb-6">
      <h2 className="text-base font-semibold text-slate-900">{scale.name}</h2>
      <p className="text-sm text-slate-500 mt-1 mb-5">{scale.intro}</p>

      {scale.domains.map((d) => (
        <fieldset key={d.id} className="mb-5">
          <legend className="text-xs font-semibold text-brand-700 uppercase tracking-wide mb-3">{d.label}</legend>
          <div className="space-y-4">
            {scale.items
              .filter((i) => i.domain === d.id)
              .map((item) => (
                <div key={item.id} role="radiogroup" aria-label={item.text}>
                  <p className="text-sm text-slate-700 mb-2">{item.text}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {scale.options.map((o) => {
                      const on = answers[item.id] === o.score;
                      return (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={on}
                          key={o.score}
                          onClick={() => setAnswers((a) => ({ ...a, [item.id]: o.score }))}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            on ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-500'
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
        </fieldset>
      ))}

      {problem && <p className="text-sm text-danger-500 mb-3">{problem}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
          {loading ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
        {left > 0 && <span className="text-xs text-slate-400 ml-auto">{left} left</span>}
      </div>
    </form>
  );
}
