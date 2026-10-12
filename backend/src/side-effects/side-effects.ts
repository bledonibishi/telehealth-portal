// What a patient can report between check-ins, and how urgent it looks to the doctor.

export const SIDE_EFFECTS = [
  { key: 'nausea', label: 'Nausea' },
  { key: 'vomiting', label: 'Vomiting' },
  { key: 'diarrhoea', label: 'Diarrhoea' },
  { key: 'constipation', label: 'Constipation' },
  { key: 'abdominal_pain', label: 'Stomach pain' },
  { key: 'reflux', label: 'Heartburn or reflux' },
  { key: 'fatigue', label: 'Tiredness' },
  { key: 'headache', label: 'Headache' },
  { key: 'dizziness', label: 'Dizziness' },
  { key: 'injection_site', label: 'Reaction where I inject' },
  { key: 'allergic_reaction', label: 'Rash, itching or swelling' },
  { key: 'other', label: 'Something else' },
] as const;

export const SIDE_EFFECT_KEYS: string[] = SIDE_EFFECTS.map((e) => e.key);

export const MAX_NOTE_LENGTH = 500;
/** Per patient per rolling 24 hours — enough for real use, a guard against a runaway client. */
export const MAX_REPORTS_PER_DAY = 10;

export const URGENT_ADVICE =
  'If you have severe pain in your stomach (especially if it spreads to your back), cannot keep fluids down, or feel very unwell, don’t wait for us — call 112 or go to your nearest emergency department.';

/** What the patient is told straight after reporting. Severe or moderate ones point to urgent help; mild ones reassure. */
export function adviceFor(severity: 'MILD' | 'MODERATE' | 'SEVERE'): string | null {
  if (severity === 'SEVERE') return URGENT_ADVICE;
  if (severity === 'MODERATE') return 'Thanks — your doctor has been told. If it gets worse, message your clinician. ' + URGENT_ADVICE;
  return null;
}

const RANK = { SEVERE: 0, MODERATE: 1, MILD: 2 } as const;
/** Most severe first, then the one waiting longest. */
export const byUrgency = (a: { severity: keyof typeof RANK; createdAt: Date }, b: { severity: keyof typeof RANK; createdAt: Date }) =>
  RANK[a.severity] - RANK[b.severity] || a.createdAt.getTime() - b.createdAt.getTime();

/** Which reports count as open alerts. The list and the bell's number must both use this, or they drift apart. */
export const OPEN_ALERTS_WHERE = { acknowledgedAt: null, patient: { activatedAt: { not: null } } } as const;
