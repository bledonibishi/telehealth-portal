import type { DocumentReading } from './prior-dose-assessment';

/**
 * Scores what the proof reader read against what a person says the document shows, to compare prompts and models
 * (scripts/compare-proof-models.ts). Not used when reading real documents.
 *
 * Three outcomes per field, because they cost different amounts:
 *   correct    matches
 *   abstained  nothing read where there was something (or a flag raised on a clean document): a clinician looks, which
 *              is safe but slow
 *   wrong      a confident error: a different value, a value invented where there is none, or a tampered document
 *              passed as clean. These are the ones that matter, since a clinician relies on the reading.
 */
export type Outcome = 'correct' | 'abstained' | 'wrong';

/** The answer key for one document. A null field is "nothing to read here"; `skip` fields are not scored. */
export interface ExpectedReading {
  readable: boolean | null; // null: not scored (a document that may or may not count as "readable")
  isPrescriptionEvidence: boolean;
  patientName: string | null;
  molecule: DocumentReading['molecule'];
  doseMg: number | null;
  documentDate: string | null;
  dateKind: DocumentReading['dateKind'];
  /** The document has signs of editing, or text aimed at the model: the reader should raise a concern. */
  flagsConcerns: boolean;
}

export const FIELDS = ['readable', 'isPrescriptionEvidence', 'patientName', 'molecule', 'doseMg', 'documentDate', 'dateKind', 'flagsConcerns'] as const;
export type Field = (typeof FIELDS)[number];
export type FieldScores = Record<Field, Outcome | 'skipped'>;

/** Case, accents, punctuation and spacing do not make a name different. */
export const normaliseName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function scoreValue<T>(expected: T | null, actual: T | null, same: (a: T, b: T) => boolean): Outcome {
  if (expected === null) return actual === null ? 'correct' : 'wrong'; // a value where there is none is invented
  if (actual === null) return 'abstained';
  return same(expected, actual) ? 'correct' : 'wrong';
}

/** `reading` is null when the reader failed outright (no key, refusal, timeout): everything goes to a clinician. */
export function scoreReading(expected: ExpectedReading, reading: DocumentReading | null): FieldScores {
  if (!reading) {
    return Object.fromEntries(FIELDS.map((f) => [f, f === 'readable' && expected.readable === null ? 'skipped' : 'abstained'])) as FieldScores;
  }
  const eq = <T>(a: T, b: T) => a === b;
  const notFound = <T extends string>(v: T | 'not_found') => (v === 'not_found' ? null : v);
  return {
    readable: expected.readable === null ? 'skipped' : reading.readable === expected.readable ? 'correct' : 'wrong',
    isPrescriptionEvidence: reading.isPrescriptionEvidence === expected.isPrescriptionEvidence ? 'correct' : 'wrong',
    patientName: scoreValue(expected.patientName, reading.patientName, (a, b) => normaliseName(a) === normaliseName(b)),
    molecule: scoreValue(notFound(expected.molecule), notFound(reading.molecule), eq),
    doseMg: scoreValue(expected.doseMg, reading.doseMg, (a, b) => Math.abs(a - b) < 1e-9),
    documentDate: scoreValue(expected.documentDate, reading.documentDate, eq),
    dateKind: scoreValue(notFound(expected.dateKind), notFound(reading.dateKind), eq),
    flagsConcerns: reading.authenticityConcerns.length > 0 === expected.flagsConcerns ? 'correct' : expected.flagsConcerns ? 'wrong' : 'abstained',
  };
}

export interface Summary {
  documents: number;
  fields: Record<Field, { correct: number; abstained: number; wrong: number }>;
  /** Documents with at least one confident error, which is the number to push to zero. */
  documentsWithAnError: number;
  /** Documents where a dose or date, which a clinician relies on to decide a dose, was confidently wrong. */
  documentsWithWrongDoseOrDate: number;
}

export function summarise(scores: FieldScores[]): Summary {
  const fields = Object.fromEntries(FIELDS.map((f) => [f, { correct: 0, abstained: 0, wrong: 0 }])) as Summary['fields'];
  for (const s of scores) for (const f of FIELDS) if (s[f] !== 'skipped') fields[f][s[f] as Outcome]++;
  return {
    documents: scores.length,
    fields,
    documentsWithAnError: scores.filter((s) => FIELDS.some((f) => s[f] === 'wrong')).length,
    documentsWithWrongDoseOrDate: scores.filter((s) => s.doseMg === 'wrong' || s.documentDate === 'wrong').length,
  };
}
