// How quickly a doctor must answer an appointment request, worked out from what the patient told us.
// Pure, so the rules live in one place and can be tested without a database.

const HOUR_MS = 3_600_000;

/** An urgent request is answered within a day; anything else within three. */
export const URGENT_RESPONSE_HOURS = 24;
export const ROUTINE_RESPONSE_HOURS = 72;
/** At or above this pain score (0–10) the request is urgent whatever else was said. */
export const URGENT_PAIN_LEVEL = 7;
export const MAX_DETAILS_LENGTH = 1000;
export const MAX_OPEN_REQUESTS = 3;

/**
 * Warning signs that need emergency services, not an appointment. Ticking any of them still records the
 * request as urgent, but the patient is told to call 112 straight away.
 */
export const RED_FLAGS: Record<string, string> = {
  chest_pain: 'Chest pain or tightness',
  breathing: 'Trouble breathing',
  fainting: 'Fainting or confusion',
  severe_abdominal_pain: 'Severe stomach pain that spreads to the back',
  cannot_keep_fluids: 'Can’t keep any fluids down',
  allergic_reaction: 'Swelling of the face, lips or throat',
  leg_swelling: 'A painful, swollen leg',
  stroke_signs: 'Face drooping, arm weakness or slurred speech',
};

export const EMERGENCY_ADVICE =
  'Some of what you ticked can be serious. Call 112 or go to your nearest emergency department now — don’t wait for an appointment. We’ve also told your doctor.';

export type Urgency = 'ROUTINE' | 'URGENT';

export interface TriageInput {
  reason: string;
  urgent?: boolean;
  painLevel?: number | null;
  redFlags?: string[];
}

export interface TriageResult {
  urgency: Urgency;
  emergencyAdvised: boolean;
  respondBy: Date;
}

export function triage(input: TriageInput, now = new Date()): TriageResult {
  const flags = (input.redFlags ?? []).filter((f) => f in RED_FLAGS);
  const emergencyAdvised = flags.length > 0;
  const urgent = emergencyAdvised || !!input.urgent || (input.painLevel ?? 0) >= URGENT_PAIN_LEVEL;
  const urgency: Urgency = urgent ? 'URGENT' : 'ROUTINE';
  const hours = urgent ? URGENT_RESPONSE_HOURS : ROUTINE_RESPONSE_HOURS;
  return { urgency, emergencyAdvised, respondBy: new Date(now.getTime() + hours * HOUR_MS) };
}

/** Urgent before routine, then whoever must be answered soonest. */
export const byPriority = <T extends { urgency: string; respondBy: Date }>(a: T, b: T) =>
  (a.urgency === 'URGENT' ? 0 : 1) - (b.urgency === 'URGENT' ? 0 : 1) || a.respondBy.getTime() - b.respondBy.getTime();
