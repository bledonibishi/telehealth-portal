/**
 * The facts a check-in brief is written from. Everything with a number in it is worked out here, in code, and handed to
 * the AI as a numbered list; the AI only chooses which facts matter and words them. Each bullet it writes must cite the
 * facts it rests on, and every number in a bullet must appear in those facts (see verifyBullets), so the brief can't state
 * a figure the record doesn't hold.
 */

export type FactKind = 'weight' | 'answers' | 'flags' | 'side_effects' | 'doses' | 'labs' | 'treatment' | 'orders' | 'patient';
export interface Fact {
  id: string;
  kind: FactKind;
  text: string;
}

export interface BriefInput {
  patient: { ageYears: number | null; gender: string | null; programme: string | null };
  checkIn: {
    completedAt: Date | null;
    weightKg: number | null;
    feeling: string | null;
    wantsToReorder: boolean | null;
    answers: Array<{ question: string; answer: string }>;
    redFlags: Array<{ severity: string; description: string }>;
  };
  /** Earlier completed check-ins, newest first. */
  previous: Array<{ completedAt: Date; weightKg: number | null; feeling: string | null; outcome: string | null }>;
  /** The weight given at the start (the intake questionnaire), when there is one. */
  startingWeightKg: number | null;
  treatment: { items: Array<{ name: string; strength: string; step: number | null }>; issuedAt: Date | null } | null;
  sideEffects: { needsAttention: boolean; reasons: string[]; roughDoses: number; lastLoggedAt: Date | null } | null;
  missedDoses: { count: number; since: Date | null } | null;
  /** Newest first. */
  labs: Array<{ name: string; value: number; unit: string; low: number | null; high: number | null; flagged: boolean; reviewed: boolean; collectedAt: Date }>;
  orders: { count: number; lastDispatchedAt: Date | null };
}

const date = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const n = (v: number) => String(Math.round(v * 10) / 10);
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${n(Math.abs(v))}`;
const clip = (s: string, len: number) => (s.length > len ? `${s.slice(0, len - 1)}…` : s);

export function buildFacts(i: BriefInput): Fact[] {
  const facts: Fact[] = [];
  const add = (kind: FactKind, text: string) => {
    const prefix = { weight: 'w', answers: 'a', flags: 'f', side_effects: 's', doses: 'd', labs: 'l', treatment: 't', orders: 'o', patient: 'p' }[kind];
    facts.push({ id: `${prefix}${facts.filter((x) => x.kind === kind).length + 1}`, kind, text });
  };

  const { patient, checkIn } = i;
  add('patient', [patient.ageYears != null ? `${patient.ageYears} years old` : null, patient.gender ? patient.gender.toLowerCase().replace(/_/g, ' ') : null, patient.programme ? `${patient.programme} programme` : null].filter(Boolean).join(', ') || 'No details on file');

  if (i.treatment?.items.length) {
    add('treatment', `On ${i.treatment.items.map((t) => `${t.name} ${t.strength}${t.step ? ` (step ${t.step})` : ''}`).join(' + ')}${i.treatment.issuedAt ? `, prescribed ${date(i.treatment.issuedAt)}` : ''}`);
  }

  // Weight: now, against the last check-in and the start, all computed here.
  if (checkIn.weightKg != null) {
    const last = i.previous.find((p) => p.weightKg != null);
    const parts = [`${n(checkIn.weightKg)} kg at this check-in`];
    if (last?.weightKg != null) parts.push(`${n(last.weightKg)} kg at the previous one on ${date(last.completedAt)} (${signed(checkIn.weightKg - last.weightKg)} kg)`);
    if (i.startingWeightKg != null) parts.push(`${n(i.startingWeightKg)} kg at the start (${signed(checkIn.weightKg - i.startingWeightKg)} kg in total)`);
    add('weight', parts.join('; '));
  } else {
    add('weight', 'No weight was given at this check-in');
  }
  if (checkIn.feeling) add('answers', `Said they feel: ${checkIn.feeling.toLowerCase().replace(/_/g, ' ')}`);
  if (checkIn.wantsToReorder !== null) add('answers', checkIn.wantsToReorder ? 'Wants to continue next month' : 'Does not want to continue next month');
  for (const a of checkIn.answers.slice(0, 20)) {
    if (/weight/i.test(a.question) || !a.answer.trim()) continue; // weight has its own fact
    add('answers', `${clip(a.question, 110)} — ${clip(a.answer, 200)}`);
  }
  for (const f of checkIn.redFlags) add('flags', `${f.severity === 'CRITICAL' ? 'Critical' : 'Warning'} flag: ${clip(f.description, 220)}`);

  if (i.sideEffects) {
    for (const r of i.sideEffects.reasons) add('side_effects', clip(r, 220));
    if (!i.sideEffects.reasons.length) add('side_effects', i.sideEffects.lastLoggedAt ? `No side-effect concerns; last logged ${date(i.sideEffects.lastLoggedAt)}` : 'No side effects logged');
  }
  if (i.missedDoses) {
    add('doses', i.missedDoses.count > 0 ? `${i.missedDoses.count} dose${i.missedDoses.count === 1 ? '' : 's'} in a row not taken${i.missedDoses.since ? ` since ${date(i.missedDoses.since)}` : ''}` : 'No missed doses in a row');
  }

  // Newest result of each test, with the one before it.
  const seen = new Set<string>();
  for (const l of i.labs) {
    if (seen.has(l.name)) continue;
    seen.add(l.name);
    const before = i.labs.find((x) => x !== l && x.name === l.name);
    const range = l.low != null && l.high != null ? `${n(l.low)}–${n(l.high)}` : l.high != null ? `up to ${n(l.high)}` : l.low != null ? `from ${n(l.low)}` : null;
    add('labs', `${l.name} ${n(l.value)} ${l.unit} on ${date(l.collectedAt)}${l.flagged ? ` (outside the lab's range${range ? ` ${range}` : ''}${l.reviewed ? ', reviewed' : ', not reviewed yet'})` : ''}${before ? `; before that ${n(before.value)} ${before.unit} on ${date(before.collectedAt)}` : ''}`);
  }
  if (!i.labs.length) add('labs', 'No lab results on file');

  add('orders', i.orders.count ? `${i.orders.count} order${i.orders.count === 1 ? '' : 's'} so far${i.orders.lastDispatchedAt ? `, the last shipped ${date(i.orders.lastDispatchedAt)}` : ''}` : 'No orders shipped yet');
  return facts;
}

export interface Bullet {
  text: string;
  sources: string[];
  importance: 'high' | 'normal';
}

const NUMBER = /\d+(?:[.,]\d+)?/g;
const numbersIn = (s: string) => (s.match(NUMBER) ?? []).map((x) => x.replace(',', '.'));

/**
 * Keeps the bullets that can be checked: each cites facts that exist, and every number in it is one of the numbers in
 * the facts it cites. The rest are dropped (and counted), so the doctor never sees a figure the record doesn't hold.
 */
export function verifyBullets(bullets: Bullet[], facts: Fact[]): { kept: Bullet[]; dropped: number } {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const kept: Bullet[] = [];
  let dropped = 0;
  for (const b of bullets) {
    const cited = (b.sources ?? []).map((id) => byId.get(id)).filter((f): f is Fact => !!f);
    if (!b.text?.trim() || cited.length === 0 || cited.length !== b.sources.length) { dropped++; continue; }
    const allowed = new Set(cited.flatMap((f) => numbersIn(f.text)));
    if (numbersIn(b.text).every((x) => allowed.has(x))) kept.push({ text: b.text.trim(), sources: [...new Set(b.sources)], importance: b.importance === 'high' ? 'high' : 'normal' });
    else dropped++;
  }
  return { kept, dropped };
}
