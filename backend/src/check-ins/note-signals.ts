import { RedFlagSeverity } from '../common/enums';
import { Flag } from '../questionnaires/definitions';

// A first pass over what a patient types in a check-in note: does it read like anxiety, flagging
// motivation, trouble with the dose — or distress? It only looks for keywords (in English, Albanian
// and German, the languages patients write in), so it can miss things and can be wrong. It never
// decides anything: it raises a flag, quoting the words it saw, so the doctor reads that note first.

export type NoteSignal = 'CRISIS' | 'ANXIETY' | 'LOW_MOTIVATION' | 'DOSE_DIFFICULTY';

// Matched on lower-case text with accents removed, so "frikë" and "frike" are the same word.
// A phrase matches when it starts a word; a trailing * lets it run on ("anxi*" → "anxious").
const KEYWORDS: Record<NoteSignal, string[]> = {
  CRISIS: [
    'suicid*', 'kill myself', 'end my life', 'end it all', 'self harm', 'self-harm', 'hurt myself', 'no reason to live', 'better off dead', 'dont want to live', 'wish i was dead', 'wish i were dead',
    'vras veten', 'vete vrasje', 'dua te vdes', 'nuk dua te jetoj', 'te demtoj veten',
    'suizid*', 'umbringen', 'nicht mehr leben', 'mir etwas antun',
  ],
  ANXIETY: [
    'anxi*', 'panic*', 'worried', 'worry', 'scared', 'afraid', 'overwhelm*', 'depress*', 'hopeless', 'cant sleep', 'cannot sleep', 'stress*', 'nervous', 'tearful', 'crying',
    'ankth*', 'frik*', 'merak*', 'ngjeshur', 'depresion*', 'e shqetesuar', 'nuk fle', 'stres*', 'qaj', 'i frikesuar', 'e frikesuar',
    'angst', 'aengst*', 'panik*', 'sorgen', 'besorgt', 'verzweifel*', 'depressiv*', 'ueberfordert', 'kann nicht schlafen',
  ],
  LOW_MOTIVATION: [
    'no motivation', 'unmotivated', 'lost motivation', 'give up', 'giving up', 'want to stop', 'wanna stop', 'want to quit', 'pointless', 'no point', 'not working', 'fed up', 'discouraged', 'cant be bothered',
    'nuk kam motivim', 'pa motivim', 'dua te ndal*', 'dua ta ndal*', 'dorezohem', 'nuk ka kuptim', 'nuk funksionon', 'nuk po funksionon', 'i demoralizuar', 'e demoralizuar', 'jam lodhur nga',
    'keine motivation', 'aufgeben', 'aufhoeren', 'will aufhoeren', 'sinnlos', 'funktioniert nicht', 'entmutigt',
  ],
  DOSE_DIFFICULTY: [
    'too strong', 'too much', 'dose is hard', 'struggl*', 'cant tolerate', 'cannot tolerate', 'hard to inject', 'afraid of needles', 'scared of needles', 'needle phobia', 'hate injecting', 'hate the injection', 'injection hurts', 'difficult to take', 'cant keep up',
    'shume e forte', 'doza eshte e forte', 'nuk e duroj', 'nuk po e duroj', 'e veshtire', 'frike nga gjilpera', 'gjilpera me dhemb', 'nuk mund ta marr',
    'zu stark', 'zu viel', 'vertrage ich nicht', 'schwer zu', 'nadeln*', 'spritze tut weh', 'angst vor spritzen',
  ],
};

const FLAGS: Record<NoteSignal, { severity: RedFlagSeverity; headline: string }> = {
  CRISIS: { severity: RedFlagSeverity.CRITICAL, headline: 'Note may express distress or thoughts of self-harm — contact the patient today' },
  ANXIETY: { severity: RedFlagSeverity.WARNING, headline: 'Note suggests anxiety or low mood' },
  LOW_MOTIVATION: { severity: RedFlagSeverity.WARNING, headline: 'Note suggests low motivation or wanting to stop' },
  DOSE_DIFFICULTY: { severity: RedFlagSeverity.WARNING, headline: 'Note suggests difficulty with the dose or injections' },
};

// "not anxious", "no panic", "nuk kam ankth", "kein Stress": a negation just before the word cancels it.
const NEGATORS = new Set(['not', 'no', 'never', 'without', 'dont', 'didnt', 'doesnt', 'isnt', 'nuk', 'pa', 'asnje', 'nicht', 'kein', 'keine', 'ohne', 'nie']);
const NEGATION_REACH = 3; // words

const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9*\s-]/g, ' ');

const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
// The text is padded with a space at both ends, so a "word start" and "word end" are just whitespace.
const compile = (phrase: string) => {
  const prefix = phrase.endsWith('*');
  const body = normalise(prefix ? phrase.slice(0, -1) : phrase).trim().replace(/\s+/g, ' ');
  return new RegExp(`(?<=\\s)(${escape(body)}${prefix ? '[a-z]*' : ''})(?=\\s)`, 'g');
};
const PATTERNS = Object.fromEntries(
  (Object.keys(KEYWORDS) as NoteSignal[]).map((signal) => [signal, KEYWORDS[signal].map(compile)]),
) as Record<NoteSignal, RegExp[]>;

export interface DetectedSignal {
  signal: NoteSignal;
  /** The words the patient used that matched. */
  matched: string[];
}

export function detectSignals(text: string | null | undefined): DetectedSignal[] {
  if (!text?.trim()) return [];
  const clean = ` ${normalise(text).replace(/\s+/g, ' ').trim()} `;
  const found: DetectedSignal[] = [];

  for (const signal of Object.keys(PATTERNS) as NoteSignal[]) {
    const matched = new Set<string>();
    for (const re of PATTERNS[signal]) {
      for (const m of clean.matchAll(re)) {
        const before = clean.slice(0, m.index!).trim().split(' ').slice(-NEGATION_REACH);
        // Self-harm language is never cancelled by a nearby "no": better a needless call than a missed one.
        if (signal !== 'CRISIS' && before.some((w) => NEGATORS.has(w))) continue;
        matched.add(m[1].trim());
      }
    }
    if (matched.size) found.push({ signal, matched: [...matched] });
  }
  return found;
}

/** The flags a check-in's free-text answers raise, for the doctor's review queue. */
export function noteFlags(texts: Array<string | null | undefined>): Flag[] {
  const merged = new Map<NoteSignal, Set<string>>();
  for (const text of texts) {
    for (const { signal, matched } of detectSignals(text)) {
      const set = merged.get(signal) ?? new Set<string>();
      matched.forEach((w) => set.add(w));
      merged.set(signal, set);
    }
  }
  return [...merged].map(([signal, words]) => ({
    severity: FLAGS[signal].severity,
    description: `${FLAGS[signal].headline} (words used: ${[...words].map((w) => `“${w}”`).join(', ')})`,
  }));
}
