export const KIND_LABEL: Record<string, string> = {
  ESTRADIOL: 'Estradiol',
  TESTOSTERONE: 'Testosterone',
  FSH: 'FSH',
  LH: 'LH',
  SHBG: 'SHBG',
  PSA: 'PSA',
  HEMATOCRIT: 'Haematocrit',
  LIPID_PANEL: 'Lipid panel',
  HBA1C: 'HbA1c',
  LIVER_FUNCTION: 'Liver function',
  OTHER: 'Other',
};

// Sensible defaults for the entry form; the lab's own report always wins.
export const DEFAULT_UNIT: Record<string, string> = {
  TESTOSTERONE: 'nmol/L',
  HEMATOCRIT: '%',
  PSA: 'ng/mL',
  ESTRADIOL: 'pmol/L',
  HBA1C: 'mmol/mol',
};

export type TrtMonitoring = {
  patientId: string;
  startedAt: string;
  refillsOnHold: boolean;
  holdReasons: string[];
  warnings: string[];
  labs: { kind: string; dueAt: string; overdue: boolean; lastValue?: number | null; lastUnit?: string | null; lastCollectedAt?: string | null }[];
};

export type LabResult = {
  id: string;
  kind: string;
  analyteName?: string | null;
  value: number;
  unit: string;
  referenceRangeLow?: number | null;
  referenceRangeHigh?: number | null;
  flagged: boolean;
  collectedAt: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  reportUrl?: string | null;
  enteredBy?: { firstName: string; lastName: string } | null;
};

export type LabSeries = {
  key: string;
  name: string;
  kind: string;
  /** Oldest first, for the chart. */
  points: LabResult[];
  latest: LabResult;
  previous: LabResult | null;
};

/** The test a result belongs to: its kind, or for "other" its own name, so two different tests never share a card. */
export const seriesKey = (r: Pick<LabResult, 'kind' | 'analyteName'>) => (r.kind === 'OTHER' ? `OTHER:${(r.analyteName ?? '').trim().toLowerCase()}` : r.kind);

/** One series per test, those with something out of range and not yet reviewed first, then the most recently measured. */
export function groupResults(results: LabResult[]): LabSeries[] {
  const by = new Map<string, LabResult[]>();
  for (const r of results) by.set(seriesKey(r), [...(by.get(seriesKey(r)) ?? []), r]);
  const series = Array.from(by.entries()).map(([key, list]) => {
    const points = [...list].sort((a, b) => new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime());
    const latest = points[points.length - 1];
    return { key, name: latest.kind === 'OTHER' ? latest.analyteName ?? 'Other' : latest.kind, kind: latest.kind, points, latest, previous: points[points.length - 2] ?? null };
  });
  const needsReview = (s: LabSeries) => (s.latest.flagged && !s.latest.reviewedAt ? 1 : 0);
  return series.sort((a, b) => needsReview(b) - needsReview(a) || new Date(b.latest.collectedAt).getTime() - new Date(a.latest.collectedAt).getTime());
}

export const roundTo = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * A typical adult reference range, offered as a one-tap suggestion when the lab's own range isn't to hand. Ranges
 * differ between labs, methods and (for some tests) with the cycle, menopause or treatment, so these are only a
 * starting point and the lab's printed range always wins. Tests whose range depends too much on the situation
 * (estradiol on treatment, lipids, liver panels) are left out on purpose.
 * The medical lead should confirm these before go-live.
 */
type Suggestion = { low: number | null; high: number | null; note: string };
const SUGGESTED: Record<string, { male?: Suggestion; female?: Suggestion; any?: Suggestion }> = {
  TESTOSTERONE: { male: { low: 8.6, high: 29, note: 'adult men' }, female: { low: 0.3, high: 1.7, note: 'adult women' } },
  FSH: { female: { low: 25.8, high: 134.8, note: 'women after the menopause' }, male: { low: 1.5, high: 12.4, note: 'adult men' } },
  LH: { female: { low: 7.7, high: 58.5, note: 'women after the menopause' }, male: { low: 1.7, high: 8.6, note: 'adult men' } },
  SHBG: { male: { low: 18, high: 54, note: 'adult men' }, female: { low: 18, high: 144, note: 'adult women' } },
  PSA: { any: { low: 0, high: 4, note: 'adult men' } },
  HEMATOCRIT: { male: { low: 40, high: 54, note: 'adult men' }, female: { low: 36, high: 48, note: 'adult women' } },
  HBA1C: { any: { low: 20, high: 42, note: 'adults without diabetes' } },
};

/** The suggestion for a test and the patient's sex, or null when there isn't a sensible one. */
export function suggestedRange(kind: string, gender?: string | null): (Suggestion & { unit: string }) | null {
  const by = SUGGESTED[kind];
  if (!by) return null;
  const pick = (gender === 'MALE' ? by.male : gender === 'FEMALE' ? by.female : undefined) ?? by.any;
  return pick ? { ...pick, unit: DEFAULT_UNIT[kind] ?? '' } : null;
}

export type LabReport = {
  id: string;
  patientId: string;
  source: 'PATIENT' | 'STAFF';
  status: 'PENDING' | 'ENTERED' | 'REJECTED';
  note?: string | null;
  filename: string;
  mimeType: string;
  fileUrl: string;
  createdAt: string;
  handledAt?: string | null;
  resultCount: number;
};
