import { CONFIG, type ProductKind } from './config';

// The medical questionnaire asked in the same quiz, after the eligibility questions. The questions, their
// wording and what each answer means clinically all live on the server (the same questionnaire the
// patient used to fill in after paying); this only fetches them and sends the answers back.

export interface IntakeQuestion {
  id: string;
  text: string;
  help?: string | null;
  type: 'single' | 'multi' | 'number' | 'text';
  optional: boolean;
  min?: number | null;
  max?: number | null;
  unit?: string | null;
  quickAnswer?: string | null;
  options?: { value: string; label: string; exclusive: boolean }[] | null;
  showIf?: { questionId: string; anyOf: string[] } | null;
}

export interface IntakeAnswer { questionId: string; answer: string; value: string }

/** Chosen option values for single/multi questions, the typed text or number for the others. */
export type IntakeValues = Record<string, string[]>;

const gql = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
  const res = await fetch(`${CONFIG.API_BASE}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
};

export async function fetchIntake(kind: ProductKind) {
  const data = await gql<{
    questionnaire: { questions: IntakeQuestion[] };
    consentText: { version: string; text: string };
  }>(
    `query Intake($kind: ConsultationKind!) {
      questionnaire(kind: $kind, stage: INTAKE) {
        questions { id text help type optional min max unit quickAnswer options { value label exclusive } showIf { questionId anyOf } }
      }
      consentText(type: TELEHEALTH) { version text }
    }`,
    { kind },
  );
  return { questions: data.questionnaire.questions, consent: data.consentText };
}

export const isVisible = (q: IntakeQuestion, values: IntakeValues) =>
  !q.showIf || (values[q.showIf.questionId] ?? []).some((v) => q.showIf!.anyOf.includes(v));

export const hasAnswer = (q: IntakeQuestion, values: IntakeValues) => (values[q.id] ?? []).some((v) => v.trim());

/** Whether what is typed for a number question is a number inside the allowed range. */
export function numberOk(q: IntakeQuestion, raw: string | undefined) {
  const n = Number(raw);
  if (!raw?.trim() || !Number.isFinite(n)) return false;
  return (q.min == null || n >= q.min) && (q.max == null || n <= q.max);
}

export function toAnswer(q: IntakeQuestion, selected: string[]): IntakeAnswer {
  if (q.type === 'single' || q.type === 'multi') {
    const labels = selected.map((v) => q.options?.find((o) => o.value === v)?.label ?? v);
    return { questionId: q.id, answer: labels.join(', '), value: selected.join('|') };
  }
  return { questionId: q.id, answer: selected[0] ?? '', value: selected[0] ?? '' };
}

/**
 * Height and weight, when the BMI calculator already worked them out: they are not asked twice. Read from the
 * calculator's own answer text ("BMI 34.2 (calculated from 168 cm, 92 kg)").
 */
export function prefillFromBmi(bmiAnswer: string | undefined): IntakeValues {
  const m = bmiAnswer ? /calculated from (\d+(?:\.\d+)?) cm, (\d+(?:\.\d+)?) kg/.exec(bmiAnswer) : null;
  return m ? { height_cm: [m[1]], weight_kg: [m[2]] } : {};
}
