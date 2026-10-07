// What goes on a patient's check-in report: pure rules, so the PDF code only lays out what this returns.

/** Check-ins are four weeks apart (see CHECK_IN_INTERVAL_DAYS), so the nth one is the week-4n review: weeks 4, 8, 12 … */
export const weekLabelFor = (checkInNumber: number) => `Week ${checkInNumber * 4}`;

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface WeightFacts {
  currentKg: number | null;
  previousKg: number | null;
  /** Negative while losing. Null without both weights. */
  changeKg: number | null;
  changePct: number | null;
  startingKg: number | null;
  lostSinceStartKg: number | null;
}

export function weightFacts(currentKg: number | null, previousKg: number | null, startingKg: number | null): WeightFacts {
  const changeKg = currentKg != null && previousKg != null ? round1(currentKg - previousKg) : null;
  return {
    currentKg,
    previousKg,
    changeKg,
    changePct: changeKg != null && previousKg ? round1((changeKg / previousKg) * 100) : null,
    startingKg,
    lostSinceStartKg: currentKg != null && startingKg != null ? round1(startingKg - currentKg) : null,
  };
}

export const kgText = (n: number | null) => (n == null ? '—' : `${n} kg`);
/** "−2.4 kg (−2.4%)" / "+0.5 kg" / "no change" */
export function changeText(kg: number | null, pct: number | null): string {
  if (kg == null) return '—';
  if (kg === 0) return 'no change';
  const sign = kg < 0 ? '−' : '+';
  return `${sign}${Math.abs(kg)} kg${pct != null ? ` (${sign}${Math.abs(pct)}%)` : ''}`;
}

export type Decision = { title: string; detail: string | null };

type RxLike = { medication: string; dosage: string; items?: { label: string; directions: string }[] } | null;

/** The doctor's decision in the patient's words. */
export function decisionOf(outcome: string | null, current: RxLike, issued: RxLike): Decision {
  const line = (rx: RxLike) => (rx?.items?.length ? rx.items.map((i) => i.label).join(' + ') : rx ? `${rx.medication} ${rx.dosage}`.trim() : null);
  switch (outcome) {
    case 'REPEAT':
      return { title: `Continue on ${line(current) ?? 'your current dose'}`, detail: 'Same medicine and dose. Your next supply has been approved.' };
    case 'NEW_PRESCRIPTION':
      return {
        title: `New dose approved: ${line(issued) ?? 'see your prescription'}`,
        detail: issued?.items?.map((i) => i.directions).filter(Boolean).join(' ') || null,
      };
    case 'HOLD':
      return { title: 'No supply this cycle', detail: 'Your treatment is on hold for now. Your care team will be in touch about next steps.' };
    case 'STOP':
      return { title: 'Treatment stopped', detail: null };
    default:
      return { title: 'Reviewed', detail: null };
  }
}
