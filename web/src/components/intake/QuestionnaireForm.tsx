'use client';

import { useEffect, useState } from 'react';

export type Question = {
  id: string;
  text: string;
  help?: string | null;
  type: 'single' | 'multi' | 'number' | 'text';
  optional: boolean;
  min?: number | null;
  max?: number | null;
  unit?: string | null;
  options?: { value: string; label: string; exclusive: boolean }[] | null;
  showIf?: { questionId: string; anyOf: string[] } | null;
};

export type SubmittedAnswer = { questionId: string; answer: string; value: string };

// Values keyed by question id: option values for single/multi, raw input otherwise.
type Values = Record<string, string[]>;

function readDraft(key?: string): Values {
  if (!key || typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export const clearDraft = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
};

function isVisible(q: Question, values: Values) {
  return !q.showIf || (values[q.showIf.questionId] ?? []).some((v) => q.showIf!.anyOf.includes(v));
}

function toAnswer(q: Question, selected: string[]): SubmittedAnswer {
  if (q.type === 'single' || q.type === 'multi') {
    const labels = selected.map((v) => q.options?.find((o) => o.value === v)?.label ?? v);
    return { questionId: q.id, answer: labels.join(', '), value: selected.join('|') };
  }
  return { questionId: q.id, answer: selected[0] ?? '', value: selected[0] ?? '' };
}

/**
 * Renders a server-defined questionnaire. The server re-validates everything
 * and owns the clinical meaning of each answer; this only collects them.
 */
export function QuestionnaireForm({
  questions, submitting, error, onSubmit, footer, ready = true, draftKey,
}: {
  questions: Question[];
  submitting: boolean;
  error?: string;
  onSubmit: (answers: SubmittedAnswer[]) => void;
  // Extra fields the page owns, shown before the submit button, and whether they're complete.
  footer?: React.ReactNode;
  ready?: boolean;
  /**
   * Keeps the answers so far on this device under this key, so leaving halfway (back, sign-out, a closed tab)
   * loses nothing. The page clears it once the questionnaire is sent, and signing out clears every draft.
   */
  draftKey?: string;
}) {
  const [values, setValues] = useState<Values>(() => readDraft(draftKey));
  useEffect(() => {
    if (!draftKey) return;
    try {
      if (Object.keys(values).length) window.localStorage.setItem(draftKey, JSON.stringify(values));
    } catch {
      /* private mode: the form still works, it just isn't kept */
    }
  }, [draftKey, values]);
  const visible = questions.filter((q) => isVisible(q, values));
  const unanswered = visible.filter((q) => !q.optional && !(values[q.id] ?? []).some((v) => v.trim()));

  const set = (id: string, v: string[]) => setValues((prev) => ({ ...prev, [id]: v }));

  const toggle = (q: Question, value: string) => {
    const current = values[q.id] ?? [];
    const option = q.options?.find((o) => o.value === value);
    if (current.includes(value)) return set(q.id, current.filter((v) => v !== value));
    // An exclusive option ("None of these") clears the others, and vice versa.
    if (option?.exclusive) return set(q.id, [value]);
    const exclusive = new Set(q.options?.filter((o) => o.exclusive).map((o) => o.value));
    set(q.id, [...current.filter((v) => !exclusive.has(v)), value]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unanswered.length || !ready) return;
    onSubmit(visible.filter((q) => (values[q.id] ?? []).some((v) => v.trim())).map((q) => toAnswer(q, values[q.id])));
  };

  const inputCls =
    'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-500 bg-white';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {visible.map((q) => {
        const selected = values[q.id] ?? [];
        return (
          <fieldset key={q.id} className="bg-white rounded-2xl border border-slate-100 p-4">
            <legend className="sr-only">{q.text}</legend>
            <p className="text-sm font-medium text-slate-900">
              {q.text}
              {q.optional && <span className="text-slate-400 font-normal"> (optional)</span>}
            </p>
            {q.help && <p className="text-xs text-slate-400 mt-1">{q.help}</p>}

            <div className="mt-3">
              {q.type === 'single' && (
                <div className="space-y-0.5">
                  {q.options?.map((o) => (
                    <label key={o.value} className="flex items-center gap-2.5 py-2 text-sm text-slate-700 cursor-pointer">
                      <input type="radio" name={q.id} checked={selected[0] === o.value} onChange={() => set(q.id, [o.value])} className="accent-ink-700" />
                      {o.label}
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'multi' && (
                <div className="space-y-0.5">
                  <p className="text-xs text-slate-400 mb-1">Select all that apply.</p>
                  {q.options?.map((o) => (
                    <label key={o.value} className="flex items-center gap-2.5 py-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(q, o.value)} className="accent-ink-700" />
                      {o.label}
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'number' && (
                <div className="flex items-center gap-2 max-w-[12rem]">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={q.min ?? undefined}
                    max={q.max ?? undefined}
                    value={selected[0] ?? ''}
                    onChange={(e) => set(q.id, [e.target.value])}
                    className={inputCls}
                  />
                  {q.unit && <span className="text-sm text-slate-500">{q.unit}</span>}
                </div>
              )}

              {q.type === 'text' && (
                <textarea rows={2} maxLength={2000} value={selected[0] ?? ''} onChange={(e) => set(q.id, [e.target.value])} className={inputCls} />
              )}
            </div>
          </fieldset>
        );
      })}

      {footer}

      {error && (
        <div className="bg-danger-50 border border-danger-100 text-danger-500 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting || unanswered.length > 0 || !ready}
        className="w-full bg-ink-700 hover:bg-ink-800 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
      >
        {submitting ? 'Sending…' : unanswered.length ? `${unanswered.length} question${unanswered.length === 1 ? '' : 's'} left` : 'Send to our clinicians'}
      </button>
    </form>
  );
}
