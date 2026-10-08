'use client';

import { hasAnswer, numberOk, type IntakeQuestion, type IntakeValues } from '@/lib/intake';

/**
 * One medical question, as the quiz shows it: single and multi choice as buttons, number and text as fields.
 * The quiz owns the answers and the position; this only shows the question and says when to go on.
 */
export default function IntakeQuestionView({
  q, values, onChange, onNext,
}: {
  q: IntakeQuestion;
  values: IntakeValues;
  onChange: (id: string, value: string[]) => void;
  /** Called when the visitor is done with this question; `next` is the answers as they now stand. */
  onNext: (next: IntakeValues) => void;
}) {
  const sel = values[q.id] ?? [];
  const canNext = q.type === 'number' ? numberOk(q, sel[0]) : q.optional || hasAnswer(q, values);

  const toggle = (value: string) => {
    const option = q.options?.find((o) => o.value === value);
    if (sel.includes(value)) return onChange(q.id, sel.filter((v) => v !== value));
    // An exclusive option ("None of these") clears the others, and the others clear it.
    if (option?.exclusive) return onChange(q.id, [value]);
    const exclusive = new Set(q.options?.filter((o) => o.exclusive).map((o) => o.value));
    onChange(q.id, [...sel.filter((v) => !exclusive.has(v)), value]);
  };

  return (
    <>
      <h2 className="thq-q">{q.text}{q.optional && <span className="thq-optional"> (optional)</span>}</h2>
      {q.help ? <p className="thq-help">{q.help}</p> : q.type === 'multi' ? <p className="thq-help">Select all that apply.</p> : <div className="thq-spacer" />}

      {q.type === 'single' && (
        <div className="thq-opts" role="radiogroup" aria-label={q.text}>
          {q.options?.map((o) => (
            <button
              key={o.value}
              type="button"
              className="thq-opt"
              role="radio"
              aria-checked={sel[0] === o.value}
              onClick={() => {
                const next = { ...values, [q.id]: [o.value] };
                onChange(q.id, [o.value]);
                onNext(next);
              }}
            >
              <span className="thq-dot" />
              {o.label}
            </button>
          ))}
        </div>
      )}

      {q.type === 'multi' && (
        <div className="thq-opts" role="group" aria-label={q.text}>
          {q.options?.map((o) => {
            const on = sel.includes(o.value);
            return (
              <button key={o.value} type="button" className="thq-opt" role="checkbox" aria-checked={on} onClick={() => toggle(o.value)}>
                <span className="thq-box">{on ? '✓' : ''}</span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {q.type === 'number' && (
        <>
          <div className="thq-numrow">
            <input
              className="thq-input"
              type="number"
              inputMode="decimal"
              step="any"
              min={q.min ?? undefined}
              max={q.max ?? undefined}
              value={sel[0] ?? ''}
              aria-label={q.text}
              onChange={(e) => onChange(q.id, [e.target.value])}
              onKeyDown={(e) => e.key === 'Enter' && canNext && onNext(values)}
            />
            {q.unit && <span className="thq-unit">{q.unit}</span>}
          </div>
          {sel[0] && !canNext && (
            <div className="thq-error">Please enter a value between {q.min} and {q.max}{q.unit ? ` ${q.unit}` : ''}.</div>
          )}
        </>
      )}

      {q.type === 'text' && (
        <textarea className="thq-input" rows={3} maxLength={2000} value={sel[0] ?? ''} aria-label={q.text} onChange={(e) => onChange(q.id, [e.target.value])} />
      )}

      {q.type !== 'single' && (
        <button type="button" className="thq-next" disabled={!canNext} onClick={() => onNext(values)}>
          {q.optional && !hasAnswer(q, values) ? 'Skip' : 'Next'}
        </button>
      )}
    </>
  );
}
