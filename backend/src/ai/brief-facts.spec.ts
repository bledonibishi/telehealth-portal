import { buildFacts, verifyBullets, type BriefInput } from './brief-facts';

const D = (s: string) => new Date(`${s}T10:00:00Z`);
const input = (over: Partial<BriefInput> = {}): BriefInput => ({
  patient: { ageYears: 41, gender: 'FEMALE', programme: 'GLP1' },
  checkIn: { completedAt: D('2026-10-10'), weightKg: 109, feeling: 'OKAY', wantsToReorder: true, answers: [{ question: 'What is your weight today?', answer: '109 kg' }, { question: 'Which side effects have you had?', answer: 'Nausea' }], redFlags: [{ severity: 'WARNING', description: 'Severe side effects reported' }] },
  previous: [{ completedAt: D('2026-09-12'), weightKg: 114, feeling: 'GOOD', outcome: 'REPEAT' }],
  startingWeightKg: 120,
  treatment: { items: [{ name: 'Wegovy', strength: '0.5 mg', step: 2 }], issuedAt: D('2026-08-20') },
  sideEffects: { needsAttention: true, reasons: ['Nausea scored 7 out of 10 this week'], roughDoses: 1, lastLoggedAt: D('2026-10-08') },
  missedDoses: { count: 1, since: D('2026-10-05') },
  labs: [{ name: 'HbA1c', value: 36, unit: 'mmol/mol', low: 20, high: 42, flagged: false, reviewed: false, collectedAt: D('2026-10-04') }, { name: 'HbA1c', value: 41, unit: 'mmol/mol', low: 20, high: 42, flagged: false, reviewed: false, collectedAt: D('2026-08-01') }],
  orders: { count: 2, lastDispatchedAt: D('2026-09-20') },
  ...over,
});

describe('buildFacts', () => {
  const facts = buildFacts(input());
  const text = (id: string) => facts.find((f) => f.id === id)?.text;

  it('works out the weight change itself, against the last check-in and the start', () => {
    expect(facts.find((f) => f.kind === 'weight')?.text).toBe('109 kg at this check-in; 114 kg at the previous one on 12 Sept 2026 (−5 kg); 120 kg at the start (−11 kg in total)');
  });

  it('numbers the facts by kind, so each can be cited', () => {
    expect(facts.map((f) => f.id)).toEqual(expect.arrayContaining(['p1', 't1', 'w1', 'a1', 'f1', 's1', 'd1', 'l1', 'o1']));
    expect(text('f1')).toMatch(/Warning flag: Severe side effects/);
    expect(text('l1')).toMatch(/HbA1c 36 mmol\/mol on 4 Oct 2026; before that 41 mmol\/mol on 1 Aug 2026/);
  });

  it('keeps the weight out of the free-text answers, since it has its own fact', () => {
    expect(facts.filter((f) => f.kind === 'answers').some((f) => /weight today/i.test(f.text))).toBe(false);
  });

  it('says plainly when something is missing rather than leaving it out', () => {
    const empty = buildFacts(input({ labs: [], missedDoses: null, sideEffects: null, startingWeightKg: null, previous: [], checkIn: { ...input().checkIn, weightKg: null } }));
    expect(empty.find((f) => f.kind === 'labs')?.text).toBe('No lab results on file');
    expect(empty.find((f) => f.kind === 'weight')?.text).toBe('No weight was given at this check-in');
  });

  it('marks an out-of-range lab that nobody has reviewed', () => {
    const f = buildFacts(input({ labs: [{ name: 'Estradiol', value: 780, unit: 'pmol/L', low: 100, high: 700, flagged: true, reviewed: false, collectedAt: D('2026-10-06') }] }));
    expect(f.find((x) => x.kind === 'labs')?.text).toBe("Estradiol 780 pmol/L on 6 Oct 2026 (outside the lab's range 100–700, not reviewed yet)");
  });
});

describe('verifyBullets', () => {
  const facts = buildFacts(input());
  const bullet = (text: string, sources: string[]) => ({ text, sources, importance: 'normal' as const });

  it('keeps a bullet whose numbers all come from the facts it cites', () => {
    const { kept, dropped } = verifyBullets([bullet('Weight is down 5 kg since the last check-in (109 kg now).', ['w1'])], facts);
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(0);
  });

  it('drops a bullet that states a number the cited facts do not hold', () => {
    expect(verifyBullets([bullet('Weight is down 6 kg since the last check-in.', ['w1'])], facts)).toMatchObject({ kept: [], dropped: 1 });
  });

  it('drops a bullet with no sources, or one citing a fact that does not exist', () => {
    expect(verifyBullets([bullet('Doing well.', []), bullet('Doing well.', ['zz9'])], facts).dropped).toBe(2);
  });

  it('accepts a decimal written with a comma, and ignores text with no numbers', () => {
    const f = buildFacts(input({ checkIn: { ...input().checkIn, weightKg: 109.5 } }));
    expect(verifyBullets([bullet('Pesha është 109,5 kg.', ['w1']), bullet('Reports nausea.', ['a1'])], f).kept).toHaveLength(2);
  });
});
