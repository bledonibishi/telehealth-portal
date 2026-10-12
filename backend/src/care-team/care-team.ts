// Who looks after a patient, worked out from what has actually happened: who prescribed, who reviewed
// their consultation, who they have an appointment with. Pure, so the ordering rule can be tested.

export interface CareTeamSource {
  clinicianId: string;
  /** How they are involved; the first listed wins when someone appears more than once. */
  via: 'PRESCRIBER' | 'CONSULTATION' | 'APPOINTMENT';
  at: Date;
}

export interface CareTeamEntry {
  clinicianId: string;
  /** The doctor responsible for the patient's current treatment. At most one. */
  primary: boolean;
  via: CareTeamSource['via'];
  since: Date;
}

const RANK = { PRESCRIBER: 0, CONSULTATION: 1, APPOINTMENT: 2 } as const;

/**
 * One entry per clinician. The prescriber of the current prescription is the patient's main doctor; without
 * a prescription yet, it is whoever reviewed their consultation. Everyone else follows, most involved first.
 */
export function careTeamOf(sources: CareTeamSource[]): CareTeamEntry[] {
  const byId = new Map<string, CareTeamEntry>();
  for (const s of [...sources].sort((a, b) => RANK[a.via] - RANK[b.via] || b.at.getTime() - a.at.getTime())) {
    const seen = byId.get(s.clinicianId);
    if (seen) seen.since = new Date(Math.min(seen.since.getTime(), s.at.getTime()));
    else byId.set(s.clinicianId, { clinicianId: s.clinicianId, primary: false, via: s.via, since: s.at });
  }
  const team = [...byId.values()];
  const lead = team.find((t) => t.via === 'PRESCRIBER') ?? team.find((t) => t.via === 'CONSULTATION');
  if (lead) lead.primary = true;
  return team;
}
