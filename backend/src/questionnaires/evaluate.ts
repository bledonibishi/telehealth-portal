import { Flag, Option, Question, Questionnaire } from './definitions';

export interface SubmittedAnswer {
  questionId: string;
  answer: string;
  // Option value(s) for single/multi ('|'-separated for multi). Clients that
  // only send labels (the Webflow eligibility quiz) are matched by label.
  value?: string | null;
}

export interface StoredAnswer {
  questionId: string;
  question: string;
  answer: string;
  value: string | null;
  section: string;
}

export interface Evaluation {
  answers: StoredAnswer[];
  flags: Flag[];
  errors: string[];
}

const MAX_TEXT = 2000;
const norm = (s: string) => s.trim().toLowerCase().replace(/[’‘]/g, "'");

function matchOption(q: Question, raw: string): Option | undefined {
  return q.options?.find((o) => o.value === raw) ?? q.options?.find((o) => norm(o.label) === norm(raw));
}

/**
 * Checks answers against a questionnaire and rebuilds them from its
 * definition — the stored question and answer text come from the server, not
 * the client. Hidden questions (showIf not met) are dropped.
 *
 * `strict` (patient portal) reports missing and invalid answers as errors.
 * Lenient (legacy clients) keeps what it can and never errors.
 */
export function evaluateAnswers(questionnaire: Questionnaire, submitted: SubmittedAnswer[], strict: boolean): Evaluation {
  const byId = new Map(submitted.map((a) => [a.questionId, a]));
  const values: Record<string, string[]> = {};
  const result: Evaluation = { answers: [], flags: [], errors: [] };
  const section = questionnaire.title;
  const fail = (q: Question, msg: string) => strict && result.errors.push(`${q.text} ${msg}`);

  for (const q of questionnaire.questions) {
    if (q.showIf && !(values[q.showIf.questionId] ?? []).some((v) => q.showIf!.anyOf.includes(v))) continue;

    const given = byId.get(q.id);
    const rawValue = given?.value?.trim() || '';
    const rawAnswer = given?.answer?.trim() || '';
    if (!rawValue && !rawAnswer) {
      if (!q.optional) fail(q, '— please answer this question.');
      continue;
    }

    if (q.type === 'single') {
      const given = rawValue || rawAnswer;
      const interpreted = q.interpret?.(given);
      const option = matchOption(q, given) ?? (interpreted ? matchOption(q, interpreted) : undefined);
      if (!option) {
        fail(q, '— please choose one of the options.');
        if (!strict) result.answers.push({ questionId: q.id, question: q.text, answer: rawAnswer, value: null, section });
        continue;
      }
      values[q.id] = [option.value];
      if (option.flag) result.flags.push(option.flag);
      result.answers.push({ questionId: q.id, question: q.text, answer: option.label, value: option.value, section });
    } else if (q.type === 'multi') {
      const parts = rawValue ? rawValue.split('|') : rawAnswer.split(', ');
      const chosen = parts.map((p) => matchOption(q, p));
      if (chosen.some((o) => !o)) {
        fail(q, '— please choose from the listed options.');
        if (!strict) result.answers.push({ questionId: q.id, question: q.text, answer: rawAnswer, value: null, section });
        continue;
      }
      const options = chosen as Option[];
      if (options.length > 1 && options.some((o) => o.exclusive)) {
        fail(q, `— “${options.find((o) => o.exclusive)!.label}” can’t be combined with other options.`);
        if (strict) continue;
      }
      values[q.id] = options.map((o) => o.value);
      options.forEach((o) => o.flag && result.flags.push(o.flag));
      result.answers.push({
        questionId: q.id,
        question: q.text,
        answer: options.map((o) => o.label).join(', '),
        value: options.map((o) => o.value).join('|'),
        section,
      });
    } else if (q.type === 'number') {
      const n = Number(rawValue || rawAnswer);
      if (!Number.isFinite(n)) {
        fail(q, '— please enter a number.');
        continue;
      }
      if ((q.min !== undefined && n < q.min) || (q.max !== undefined && n > q.max)) {
        fail(q, `— please enter a value between ${q.min} and ${q.max}${q.unit ? ` ${q.unit}` : ''}.`);
        continue;
      }
      values[q.id] = [String(n)];
      result.answers.push({ questionId: q.id, question: q.text, answer: `${n}${q.unit ? ` ${q.unit}` : ''}`, value: String(n), section });
    } else {
      const text = rawAnswer.slice(0, MAX_TEXT);
      values[q.id] = [text];
      result.answers.push({ questionId: q.id, question: q.text, answer: text, value: null, section });
    }
  }

  if (questionnaire.derive && result.errors.length === 0) {
    const flat = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.join('|')]));
    const derived = questionnaire.derive(flat);
    result.answers.push(...derived.answers.map((a) => ({ ...a, section })));
    result.flags.push(...derived.flags);
  }

  return result;
}
