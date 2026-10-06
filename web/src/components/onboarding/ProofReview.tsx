'use client';

import { useEffect, useState } from 'react';

export type ProofCheck = {
  key: 'NAME' | 'MEDICINE' | 'DOSE' | 'DATE';
  status: 'PASS' | 'FAIL' | 'REVIEW';
  value?: string | null;
  hint?: string | null;
};

const CHECK_LABEL: Record<ProofCheck['key'], string> = {
  NAME: 'Your name',
  MEDICINE: 'Medicine',
  DOSE: 'Dose',
  DATE: 'Date',
};

function CheckIcon({ state }: { state: 'pass' | 'warn' | 'neutral' | 'active' | 'waiting' }) {
  if (state === 'active') {
    return <span className="w-6 h-6 rounded-full border-2 border-ink-100 border-t-ink-700 animate-spin flex-shrink-0" aria-hidden />;
  }
  const cls = {
    pass: 'bg-ink-100 text-ink-800',
    warn: 'bg-amber-100 text-amber-700',
    neutral: 'bg-slate-100 text-slate-500',
    waiting: 'bg-slate-100 text-slate-300',
  }[state];
  return (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${cls}`} aria-hidden>
      {state === 'pass' ? '✓' : state === 'warn' ? '!' : state === 'neutral' ? '–' : '•'}
    </span>
  );
}

/**
 * Shown while the document is being read (a few seconds). The steps advance on a timer — the
 * request is a single call — and the last one keeps spinning until the answer arrives.
 */
export function ChecklistLoader({ title, steps }: { title: string; steps: string[] }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCurrent((c) => Math.min(c + 1, steps.length - 1)), 1400);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className="py-6" role="status" aria-live="polite">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-500 mt-2">This usually takes a few seconds. Please keep this page open.</p>
      <ul className="mt-6 bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
        {steps.map((step, i) => (
          <li key={step} className="flex items-center gap-3 px-4 py-3.5">
            <CheckIcon state={i < current ? 'pass' : i === current ? 'active' : 'waiting'} />
            <span className={`text-sm ${i <= current ? 'text-slate-800' : 'text-slate-400'}`}>{step}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const PROOF_STEPS = ['Reading your document', 'Checking your name', 'Checking the medicine and dose', 'Checking the date'];
export const NAME_EVIDENCE_STEPS = ['Reading your document', 'Looking for your previous and current names', 'Matching them with your account'];

/** What was read off the document, one line per check: green when it matches, amber when it doesn't. */
export function ProofChecklist({ checks, doseQuestion }: { checks: ProofCheck[]; doseQuestion?: React.ReactNode }) {
  return (
    <div className="mt-5 bg-white rounded-2xl border border-slate-100">
      <p className="px-4 pt-4 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">What we checked</p>
      <ul className="divide-y divide-slate-100">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-3 px-4 py-3.5">
            <CheckIcon state={c.status === 'PASS' ? 'pass' : c.status === 'FAIL' ? 'warn' : 'neutral'} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-slate-900">{CHECK_LABEL[c.key]}</span>
                <span className={`text-sm text-right truncate ${c.status === 'FAIL' ? 'text-amber-800 font-medium' : 'text-slate-600'}`}>
                  {c.value ?? 'Not found'}
                </span>
              </div>
              {c.status !== 'PASS' && c.hint && <p className="text-xs mt-1 text-right text-slate-500">{c.hint}</p>}
              {c.key === 'DOSE' && doseQuestion}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type DoseChoice = 'DOCUMENT_CORRECT' | 'STEPPED_UP_SINCE' | 'STEPPED_DOWN_SINCE' | 'NOT_SURE';

const mgText = (mg: number) => `${mg} mg`;

/**
 * The document's dose differs from the one the patient gave: both side by side, why it matters, and
 * "what's your current dose?" — each answer saying what happens next. The options follow which dose
 * is higher, so nobody is asked whether they "moved up" to a lower dose.
 */
export function DoseQuestion({
  documentMg, reportedDose, saving, onAnswer,
}: {
  documentMg: number;
  reportedDose: string;
  saving: boolean;
  onAnswer: (choice: DoseChoice) => void;
}) {
  const [choice, setChoice] = useState<DoseChoice | null>(null);
  const reportedMg = parseFloat(reportedDose);
  const went = reportedMg > documentMg ? 'up' : 'down';
  const lower = mgText(Math.min(documentMg, reportedMg));
  const doc = mgText(documentMg);

  const options: { value: DoseChoice; title: string; detail: string }[] = [
    { value: 'DOCUMENT_CORRECT', title: `${doc} — the document is right`, detail: `Your clinician will go by ${doc}.` },
    went === 'up'
      ? {
          value: 'STEPPED_UP_SINCE',
          title: `${reportedDose} — my dose went up after this document`,
          detail: `Upload a newer document showing ${reportedDose} if you have one. Until then your clinician goes by ${doc}.`,
        }
      : {
          value: 'STEPPED_DOWN_SINCE',
          title: `${reportedDose} — my dose went down after this document`,
          detail: `No need to upload anything — your clinician will go by ${reportedDose}.`,
        },
    { value: 'NOT_SURE', title: 'I’m not sure', detail: `Your clinician will confirm it with you, going by the lower dose (${lower}) until then.` },
  ];

  return (
    <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center" aria-hidden>
          !
        </span>
        <h2 className="text-sm font-semibold text-amber-900">Your dose doesn’t match</h2>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className="rounded-xl bg-white border border-amber-100 px-3 py-2.5 text-center">
          <p className="text-[11px] text-slate-500">On your document</p>
          <p className="text-lg font-bold text-slate-900">{doc}</p>
        </div>
        <span className="self-center text-amber-600 font-bold" aria-label="does not match">≠</span>
        <div className="rounded-xl bg-white border border-amber-100 px-3 py-2.5 text-center">
          <p className="text-[11px] text-slate-500">You told us</p>
          <p className="text-lg font-bold text-slate-900">{reportedDose}</p>
        </div>
      </div>

      <p className="text-xs text-amber-900/80 mt-3">We use your current dose to decide where you can safely continue.</p>
      <p className="text-sm font-semibold text-slate-900 mt-3">What’s your current weekly dose?</p>

      <div className="space-y-2 mt-2" role="radiogroup">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={choice === o.value}
            onClick={() => setChoice(o.value)}
            className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
              choice === o.value ? 'border-ink-500 bg-white ring-1 ring-ink-500' : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <span className={`w-4 h-4 mt-0.5 rounded-full border flex-shrink-0 ${choice === o.value ? 'border-ink-700 bg-ink-700' : 'border-slate-300'}`} />
            <span>
              <span className="block text-sm font-medium text-slate-900">{o.title}</span>
              <span className="block text-xs text-slate-500 mt-0.5">{o.detail}</span>
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => choice && onAnswer(choice)}
        disabled={!choice || saving}
        className="w-full mt-3 bg-ink-700 hover:bg-ink-800 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
      >
        {saving ? 'Saving…' : 'Confirm'}
      </button>
    </section>
  );
}
