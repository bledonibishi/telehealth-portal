import { CONFIG, type ProductKind } from './config';

// The medical questionnaire asked after a treatment is chosen and before paying. The questions, their
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
        questions { id text help type optional min max unit options { value label exclusive } showIf { questionId anyOf } }
      }
      consentText(type: TELEHEALTH) { version text }
    }`,
    { kind },
  );
  return { questions: data.questionnaire.questions, consent: data.consentText };
}

export async function saveIntake(input: { leadId: string; email: string; answers: IntakeAnswer[]; telehealthConsentVersion: string }) {
  await gql(
    `mutation SaveLeadIntake($input: SaveLeadIntakeInput!) { saveLeadIntake(input: $input) }`,
    { input },
  );
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

// ── Answers kept on this device while the visitor works through the questions ──
// Health answers: this device only, expire after a while, removed once they are sent. Keyed by the lead,
// so one person's answers are never shown to the next person on a shared browser.

const draftKey = (leadId: string) => `th_intake_draft_${leadId}`;
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function loadDraft(leadId: string): IntakeValues {
  try {
    const raw = JSON.parse(window.localStorage.getItem(draftKey(leadId)) ?? 'null');
    if (!raw || typeof raw.savedAt !== 'number' || Date.now() - raw.savedAt > DRAFT_TTL_MS || typeof raw.values !== 'object') return {};
    return raw.values;
  } catch {
    return {};
  }
}

export function saveDraft(leadId: string, values: IntakeValues) {
  try {
    window.localStorage.setItem(draftKey(leadId), JSON.stringify({ savedAt: Date.now(), values }));
  } catch {
    /* storage blocked: the questions still work, they just aren't kept */
  }
}

export function clearDraft(leadId: string) {
  try {
    window.localStorage.removeItem(draftKey(leadId));
  } catch {
    /* nothing to clear */
  }
}
