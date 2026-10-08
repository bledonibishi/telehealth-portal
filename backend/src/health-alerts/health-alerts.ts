// What a doctor should look at first, and how urgent it is. Pure: the service gathers the facts, this decides.
//
//   RED     a sustained rise in weight, or a severe side effect nobody has acknowledged
//   YELLOW  consultations waiting for a doctor more than a day, check-ins the patient is overdue on
//   ORANGE  a weight entry that looks like a typo, prescriptions that run out within a week
//
// It only points at things. It never changes a patient's treatment.

export type AlertLevel = 'RED' | 'YELLOW' | 'ORANGE';
export type AlertKind = 'WEIGHT_GAIN' | 'SEVERE_SIDE_EFFECT' | 'PENDING_REVIEWS' | 'OVERDUE_CHECK_INS' | 'WEIGHT_ENTRY_CHECK' | 'PRESCRIPTIONS_EXPIRING';

export interface AlertPatient {
  id: string;
  name: string;
}

export interface HealthAlert {
  id: string;
  level: AlertLevel;
  kind: AlertKind;
  /** How many patients or items the alert covers. */
  count: number;
  /** Who it is about: always for a single patient, the first few for a group. */
  patients: AlertPatient[];
  /** WEIGHT_GAIN: percent over 4 weeks. PENDING_REVIEWS: average days waiting. WEIGHT_ENTRY_CHECK: the latest weight. */
  value: number | null;
  /** WEIGHT_ENTRY_CHECK: the weight before it. */
  other: number | null;
  /** SEVERE_SIDE_EFFECT: the effects reported, as keys. */
  effects: string[];
}

export interface AlertInput {
  weightTrends: { patient: AlertPatient; level: string; changePct28Days: number | null; latestKg: number | null; previousKg: number | null }[];
  severeReports: { patient: AlertPatient; effects: string[] }[];
  /** `waitingSince`: when it last joined the queue, which for a reply to a doctor's question is the reply, not the first submission. */
  pendingReviews: { patient: AlertPatient; waitingSince: Date }[];
  overdueCheckIns: { patient: AlertPatient }[];
  expiringPrescriptions: { patient: AlertPatient; validUntil: Date }[];
}

/** A consultation is "waiting" once it has been a full day without a decision. */
export const PENDING_REVIEW_AFTER_HOURS = 24;
/** A check-in is "overdue" once it is this many days past its due date and still not done. */
export const CHECK_IN_OVERDUE_AFTER_DAYS = 2;
/** Prescriptions that end within this many days are listed. */
export const EXPIRING_WITHIN_DAYS = 7;
/** A group alert names this many patients; the count covers the rest. */
export const NAMES_PER_GROUP = 8;

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const unique = (ps: AlertPatient[]) => [...new Map(ps.map((p) => [p.id, p])).values()];
const LEVEL_RANK: Record<AlertLevel, number> = { RED: 0, YELLOW: 1, ORANGE: 2 };
// Within a colour: a reaction to the medicine before a number on the scale, a queue before a list.
const KIND_RANK: Record<AlertKind, number> = { SEVERE_SIDE_EFFECT: 0, WEIGHT_GAIN: 1, PENDING_REVIEWS: 2, OVERDUE_CHECK_INS: 3, PRESCRIPTIONS_EXPIRING: 4, WEIGHT_ENTRY_CHECK: 5 };

export function buildHealthAlerts(input: AlertInput, now: Date = new Date()): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const make = (a: Pick<HealthAlert, 'id' | 'level' | 'kind'> & Partial<HealthAlert>): HealthAlert => ({ count: 1, patients: [], value: null, other: null, effects: [], ...a });

  // One alert per patient where it is about a single person's condition.
  for (const w of input.weightTrends) {
    if (w.level === 'GAIN') alerts.push(make({ id: `WEIGHT_GAIN:${w.patient.id}`, level: 'RED', kind: 'WEIGHT_GAIN', patients: [w.patient], value: w.changePct28Days }));
    else if (w.level === 'CHECK_ENTRY') alerts.push(make({ id: `WEIGHT_ENTRY_CHECK:${w.patient.id}`, level: 'ORANGE', kind: 'WEIGHT_ENTRY_CHECK', patients: [w.patient], value: w.latestKg, other: w.previousKg }));
  }
  const severe = new Map<string, { patient: AlertPatient; effects: Set<string> }>();
  for (const r of input.severeReports) {
    const seen = severe.get(r.patient.id) ?? { patient: r.patient, effects: new Set<string>() };
    r.effects.forEach((e) => seen.effects.add(e));
    severe.set(r.patient.id, seen);
  }
  for (const { patient, effects } of severe.values()) alerts.push(make({ id: `SEVERE_SIDE_EFFECT:${patient.id}`, level: 'RED', kind: 'SEVERE_SIDE_EFFECT', patients: [patient], effects: [...effects] }));

  // One alert for a queue: the number matters more than any one name.
  const waiting = input.pendingReviews.filter((r) => now.getTime() - r.waitingSince.getTime() >= PENDING_REVIEW_AFTER_HOURS * 3_600_000);
  if (waiting.length) {
    const avgDays = waiting.reduce((sum, r) => sum + (now.getTime() - r.waitingSince.getTime()) / DAY, 0) / waiting.length;
    alerts.push(make({ id: 'PENDING_REVIEWS', level: 'YELLOW', kind: 'PENDING_REVIEWS', count: waiting.length, patients: unique(waiting.map((r) => r.patient)).slice(0, NAMES_PER_GROUP), value: round1(avgDays) }));
  }
  const overdue = unique(input.overdueCheckIns.map((c) => c.patient));
  if (overdue.length) alerts.push(make({ id: 'OVERDUE_CHECK_INS', level: 'YELLOW', kind: 'OVERDUE_CHECK_INS', count: overdue.length, patients: overdue.slice(0, NAMES_PER_GROUP) }));

  const expiring = input.expiringPrescriptions
    .filter((p) => p.validUntil.getTime() >= now.getTime() && p.validUntil.getTime() <= now.getTime() + EXPIRING_WITHIN_DAYS * DAY)
    .sort((a, b) => a.validUntil.getTime() - b.validUntil.getTime());
  const expiringPatients = unique(expiring.map((p) => p.patient));
  if (expiringPatients.length) alerts.push(make({ id: 'PRESCRIPTIONS_EXPIRING', level: 'ORANGE', kind: 'PRESCRIPTIONS_EXPIRING', count: expiringPatients.length, patients: expiringPatients.slice(0, NAMES_PER_GROUP) }));

  // Red first; within a colour by what it is (`value` means something different for each kind, so it is only compared
  // between two weight rises: the bigger first); then by id so the order does not jump about between refreshes.
  return alerts.sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      (a.kind === 'WEIGHT_GAIN' ? (b.value ?? 0) - (a.value ?? 0) : 0) ||
      a.id.localeCompare(b.id),
  );
}
