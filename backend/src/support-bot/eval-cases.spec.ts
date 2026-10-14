import { answerProblems, EVAL_CASES } from './eval-cases';
import { DEFAULT_ARTICLES } from './support-knowledge';

describe('the assistant’s test questions', () => {
  it('are unique, and every article they expect exists', () => {
    expect(new Set(EVAL_CASES.map((c) => c.name)).size).toBe(EVAL_CASES.length);
    const ids = new Set(DEFAULT_ARTICLES.map((a) => a.id));
    for (const c of EVAL_CASES) if (c.expect.article) expect(ids.has(c.expect.article)).toBe(true);
  });

  it('cover health questions (including mixed ones and other languages), asking for a person, greetings, and what is not covered', () => {
    const intents = new Set(EVAL_CASES.flatMap((c) => c.expect.intent));
    for (const i of ['SUPPORT_QUESTION', 'MEDICAL', 'HUMAN_REQUESTED', 'GREETING', 'SATISFIED', 'NOT_SATISFIED', 'OTHER']) expect(intents.has(i as any)).toBe(true);
    expect(EVAL_CASES.filter((c) => c.expect.intent.includes('MEDICAL')).length).toBeGreaterThanOrEqual(5);
    expect(EVAL_CASES.some((c) => c.transcript.includes('Kam të përziera'))).toBe(true);
  });

  it('every health question expects no article at all', () => {
    for (const c of EVAL_CASES.filter((x) => x.expect.intent.length === 1 && x.expect.intent[0] === 'MEDICAL')) expect(c.expect.article).toBeNull();
  });

  it('the starting articles themselves pass the safety check', () => {
    for (const a of DEFAULT_ARTICLES) expect(answerProblems(a.body)).toEqual([]);
  });
});
