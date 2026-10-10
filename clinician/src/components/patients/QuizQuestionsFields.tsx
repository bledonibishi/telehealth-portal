import { Select } from '@/components/ui/Select';
import { useI18n } from '@/lib/i18n/I18nProvider';
export type QuestionOption = { value: string; label: string; exclusive: boolean };
export type Question = {
  id: string;
  text: string;
  help?: string | null;
  type: 'single' | 'multi' | 'number' | 'text';
  optional: boolean;
  options?: QuestionOption[] | null;
  min?: number | null;
  max?: number | null;
  unit?: string | null;
  showIf?: { questionId: string; anyOf: string[] } | null;
};

export type QuizAnswerValue = string | string[];
export type QuizAnswers = Record<string, QuizAnswerValue>;

function isVisible(q: Question, answers: QuizAnswers): boolean {
  if (!q.showIf) return true;
  const selected = answers[q.showIf.questionId];
  const values = Array.isArray(selected) ? selected : selected ? [selected] : [];
  return values.some((v) => q.showIf!.anyOf.includes(v));
}

// Same shape the createPatient mutation's quizAnswers field expects
// (backend/src/consultations/dto/submit-intake-quiz.input.ts's QuizAnswerInput).
export function buildQuizAnswerInputs(questions: Question[], answers: QuizAnswers) {
  const inputs: { questionId: string; answer: string; value?: string }[] = [];
  for (const q of questions) {
    if (!isVisible(q, answers)) continue;
    const raw = answers[q.id];
    if (raw === undefined || raw === '' || (Array.isArray(raw) && raw.length === 0)) continue;

    if (q.type === 'single') {
      const option = q.options?.find((o) => o.value === raw);
      if (option) inputs.push({ questionId: q.id, answer: option.label, value: option.value });
    } else if (q.type === 'multi') {
      const selected = (raw as string[])
        .map((v) => q.options?.find((o) => o.value === v))
        .filter((o): o is QuestionOption => !!o);
      if (selected.length) {
        inputs.push({ questionId: q.id, answer: selected.map((o) => o.label).join(', '), value: selected.map((o) => o.value).join('|') });
      }
    } else if (q.type === 'number') {
      inputs.push({ questionId: q.id, answer: String(raw), value: String(raw) });
    } else {
      inputs.push({ questionId: q.id, answer: String(raw) });
    }
  }
  return inputs;
}

const SAFE_NUMBER: Record<string, number> = { height_cm: 170, weight_kg: 95, bp_systolic: 120, bp_diastolic: 80 };
const SAFE_TEXT: Record<string, string> = { current_medications: 'None', allergies: 'None' };

// A generic "nothing concerning" default per question, for the Autofill
// button. The server never sends which options raise a clinical flag (see
// questionnaire.model.ts), so this leans on the "no/none/never" wording
// convention every yes/no question in the questionnaire follows, rather than
// hardcoding per-question logic here.
function defaultSingleValue(options: QuestionOption[]): string | undefined {
  const safe = options.find((o) => /^(no|none|never)$/i.test(o.value)) ?? options.find((o) => o.value !== 'yes');
  return (safe ?? options[0])?.value;
}

export function autofillAnswers(questions: Question[]): QuizAnswers {
  const answers: QuizAnswers = {};
  for (const q of questions) {
    if (!isVisible(q, answers)) continue;
    if (q.type === 'single' && q.options?.length) {
      const value = defaultSingleValue(q.options);
      if (value) answers[q.id] = value;
    } else if (q.type === 'multi' && q.options?.length) {
      const exclusive = q.options.find((o) => o.exclusive);
      answers[q.id] = [exclusive?.value ?? q.options[0].value];
    } else if (q.type === 'number') {
      const mid = q.min != null && q.max != null ? Math.round((q.min + q.max) / 2) : q.min ?? 0;
      answers[q.id] = String(SAFE_NUMBER[q.id] ?? mid);
    } else if (q.type === 'text') {
      answers[q.id] = SAFE_TEXT[q.id] ?? (q.optional ? '' : 'None');
    }
  }
  return answers;
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'text-xs text-gray-400 mb-0.5 block';

export default function QuizQuestionsFields({
  questions,
  answers,
  onChange,
}: {
  questions: Question[];
  answers: QuizAnswers;
  onChange: (questionId: string, value: QuizAnswerValue) => void;
}) {
  const { t } = useI18n();
  const toggleMulti = (q: Question, value: string) => {
    const current = (answers[q.id] as string[]) ?? [];
    const option = q.options?.find((o) => o.value === value);
    if (current.includes(value)) {
      onChange(q.id, current.filter((v) => v !== value));
    } else if (option?.exclusive) {
      onChange(q.id, [value]);
    } else {
      onChange(q.id, [...current.filter((v) => !q.options?.find((o) => o.value === v)?.exclusive), value]);
    }
  };

  return (
    <div className="space-y-4">
      {questions.filter((q) => isVisible(q, answers)).map((q) => (
        <div key={q.id}>
          <label className={labelCls}>
            {q.text}
            {!q.optional && <span className="text-red-400"> *</span>}
          </label>
          {q.help && <p className="text-xs text-gray-400 mb-1">{q.help}</p>}

          {q.type === 'single' && (
            <Select ariaLabel={q.text} value={(answers[q.id] as string) ?? ''} onChange={(v) => onChange(q.id, v)} options={[{ value: '', label: t('Select…') }, ...(q.options ?? []).map((o) => ({ value: o.value, label: o.label }))]} />
          )}

          {q.type === 'multi' && (
            <div className="flex flex-wrap gap-2">
              {q.options?.map((o) => {
                const checked = ((answers[q.id] as string[]) ?? []).includes(o.value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => toggleMulti(q, o.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                      checked ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === 'number' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                className={inputCls}
                min={q.min ?? undefined}
                max={q.max ?? undefined}
                value={(answers[q.id] as string) ?? ''}
                onChange={(e) => onChange(q.id, e.target.value)}
              />
              {q.unit && <span className="text-xs text-gray-400 shrink-0">{q.unit}</span>}
            </div>
          )}

          {q.type === 'text' && (
            <textarea
              rows={2}
              className={inputCls}
              value={(answers[q.id] as string) ?? ''}
              onChange={(e) => onChange(q.id, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
