import type { ProductKind } from './config';
import type { QuizQuestion } from './quiz-data';

// Saves a visitor's place in the eligibility quiz as they move through it, so a refresh or a
// return visit picks up where they left off. One entry per product (HRT, GLP-1, TRT).
//
// These are health answers, so they stay on this device only, expire after a while, and are
// removed as soon as the quiz is finished (or restarted). Name and email are never stored.

export interface SavedAnswer { question: string; sel: string[] }
export interface QuizProgress {
  idx: number;
  answers: Record<string, SavedAnswer>;
  bmiBand: string | null;
  view: 'q' | 'calc' | 'details';
}

const key = (product: ProductKind) => `th_quiz_progress_${product}`;
const VERSION = 1;
export const PROGRESS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const browserStore = (): Store | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // storage blocked (e.g. private mode): the quiz just won't remember
  }
};

export function saveProgress(product: ProductKind, progress: QuizProgress, store: Store | null = browserStore(), now = Date.now()) {
  if (!store) return;
  try {
    store.setItem(key(product), JSON.stringify({ v: VERSION, savedAt: now, ...progress }));
  } catch {
    /* full or blocked — nothing to do */
  }
}

export function clearProgress(product: ProductKind, store: Store | null = browserStore()) {
  try {
    store?.removeItem(key(product));
  } catch {
    /* ignore */
  }
}

// A BMI worked out by the calculator. One under 27 ruled the visitor out, so it is never put back.
const isBmiAnswer = (q: QuizQuestion, sel: string[]) => {
  const m = q.id === 'bmi' && sel.length === 1 ? /^BMI (\d+(?:\.\d+)?)/.exec(sel[0]) : null;
  return !!m && Number(m[1]) >= 27;
};

/**
 * What was saved, checked against the current quiz: answers to questions that no longer exist or
 * options that were reworded are dropped, and the position is put back inside the questions that
 * are showing. Returns null when there is nothing worth restoring.
 */
export function loadProgress(
  product: ProductKind,
  questions: QuizQuestion[],
  store: Store | null = browserStore(),
  now = Date.now(),
): QuizProgress | null {
  if (!store) return null;
  let raw: any;
  try {
    raw = JSON.parse(store.getItem(key(product)) ?? 'null');
  } catch {
    return null;
  }
  if (!raw || raw.v !== VERSION || typeof raw.savedAt !== 'number' || now - raw.savedAt > PROGRESS_TTL_MS) {
    if (raw) clearProgress(product, store);
    return null;
  }

  const answers: Record<string, SavedAnswer> = {};
  for (const q of questions) {
    const saved = raw.answers?.[q.id];
    if (!saved || !Array.isArray(saved.sel) || saved.sel.some((s: unknown) => typeof s !== 'string')) continue;
    const known = saved.sel.every((label: string) => q.options.some((o) => o.l === label));
    if (!saved.sel.length || !(known || isBmiAnswer(q, saved.sel))) continue;
    answers[q.id] = { question: q.q, sel: saved.sel };
  }
  if (!Object.keys(answers).length) return null;

  // Only the BMI band from a BMI that was actually answered decides which questions show.
  const bmiBand = answers.bmi && (raw.bmiBand === '27-29' || raw.bmiBand === '30+') ? (raw.bmiBand as string) : null;
  const visible = questions.filter((q) => !q.showIf || q.showIf({ bmiBand }));
  const unanswered = visible.findIndex((q) => !answers[q.id]);
  const allAnswered = unanswered === -1;
  // Back to the question they were on — but never past one they haven't answered.
  const savedIdx = Number.isInteger(raw.idx) ? raw.idx : 0;
  const idx = Math.max(0, Math.min(savedIdx, allAnswered ? visible.length - 1 : unanswered));
  return { idx, answers, bmiBand, view: allAnswered && raw.view === 'details' ? 'details' : 'q' };
}
