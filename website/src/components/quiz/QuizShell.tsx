'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductKey } from '@/data/questions';
import { QUIZZES, checkEligibility, type Question } from '@/data/questions';

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-brand-500 rounded-full transition-all duration-500"
        style={{ width: `${((current + 1) / total) * 100}%` }}
      />
    </div>
  );
}

function QuestionCard({
  question,
  selected,
  onChange,
}: {
  question: Question;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    const opt = question.options.find((o) => o.id === id)!;

    if (question.type === 'single') {
      onChange([id]);
      return;
    }

    // multi-select: handle "none of above" mutual exclusivity
    if (opt.noneOfAbove) {
      onChange(selected.includes(id) ? [] : [id]);
      return;
    }

    // deselect "none of above" when picking a real option
    const withoutNone = selected.filter(
      (s) => !question.options.find((o) => o.id === s)?.noneOfAbove,
    );

    onChange(
      withoutNone.includes(id)
        ? withoutNone.filter((s) => s !== id)
        : [...withoutNone, id],
    );
  };

  return (
    <div className="space-y-3">
      {question.options.map((opt) => {
        const isSelected = selected.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all ${
              isSelected
                ? 'border-brand-500 bg-brand-50 text-slate-900'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  isSelected ? 'border-brand-500 bg-brand-500' : 'border-slate-300'
                }`}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className="text-sm font-medium">{opt.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function EligibleScreen({ product }: { product: ProductKey }) {
  const router = useRouter();
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <svg className="w-10 h-10 text-green-600" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 13l4 4L19 7"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-3">
          Great news — you appear eligible!
        </h2>
        <p className="text-slate-500 max-w-md mx-auto">
          Based on your answers, {product === 'hrt' ? 'HRT' : 'GLP-1'} treatment may be suitable for
          you. Choose your plan and a clinician will review your case before issuing a prescription.
        </p>
      </div>
      <button
        onClick={() => router.push(`/select?product=${product}`)}
        className="inline-flex items-center bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-4 rounded-xl transition-colors text-lg"
      >
        See plans &amp; pricing →
      </button>
    </div>
  );
}

function IneligibleScreen({ product }: { product: ProductKey }) {
  const other = product === 'hrt' ? 'glp1' : 'hrt';
  const otherLabel = product === 'hrt' ? 'GLP-1' : 'HRT';
  const router = useRouter();
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
        <svg className="w-10 h-10 text-slate-400" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-3">Unfortunately, not right now</h2>
        <p className="text-slate-500 max-w-md mx-auto">
          Based on your answers, {product === 'hrt' ? 'HRT' : 'GLP-1'} may not be suitable for you at
          this time. We strongly recommend speaking to your GP who can discuss alternatives.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => router.push(`/quiz?product=${other}`)}
          className="inline-flex items-center bg-slate-900 hover:bg-slate-800 text-white font-medium px-6 py-3 rounded-xl transition-colors"
        >
          Try the {otherLabel} quiz instead
        </button>
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium px-6 py-3 rounded-xl transition-colors"
        >
          Back to home
        </button>
      </div>
    </div>
  );
}

export function QuizShell({ product }: { product: ProductKey }) {
  const quiz = QUIZZES[product];
  const questions = quiz.questions;

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<'eligible' | 'ineligible' | null>(null);

  const current = questions[step];
  const selected = answers[current?.id] ?? [];
  const canAdvance = selected.length > 0;

  const handleNext = () => {
    if (step < questions.length - 1) {
      setStep((s) => s + 1);
    } else {
      setResult(checkEligibility(questions, answers));
    }
  };

  const handleBack = () => {
    if (result) { setResult(null); return; }
    if (step > 0) setStep((s) => s - 1);
  };

  if (result === 'eligible') return <EligibleScreen product={product} />;
  if (result === 'ineligible') return <IneligibleScreen product={product} />;

  return (
    <div className="space-y-8">
      <ProgressBar current={step} total={questions.length} />

      <div className="text-xs text-slate-400 font-medium tracking-wide uppercase">
        Question {step + 1} of {questions.length}
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">{current.text}</h2>
        {current.subtext && <p className="text-slate-500 text-sm">{current.subtext}</p>}
      </div>

      <QuestionCard
        question={current}
        selected={selected}
        onChange={(ids) => setAnswers((prev) => ({ ...prev, [current.id]: ids }))}
      />

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 0}
          className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canAdvance}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-7 py-3 rounded-xl transition-colors"
        >
          {step === questions.length - 1 ? 'See my result' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
