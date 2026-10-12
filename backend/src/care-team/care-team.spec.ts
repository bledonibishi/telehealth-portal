import { careTeamOf } from './care-team';

const at = (d: string) => new Date(d);

describe('careTeamOf', () => {
  it('makes the current prescriber the main doctor, and lists each clinician once from when they first appear', () => {
    const team = careTeamOf([
      { clinicianId: 'reviewer', via: 'CONSULTATION', at: at('2026-07-01') },
      { clinicianId: 'prescriber', via: 'PRESCRIBER', at: at('2026-09-01') },
      { clinicianId: 'prescriber', via: 'CONSULTATION', at: at('2026-07-10') },
      { clinicianId: 'locum', via: 'APPOINTMENT', at: at('2026-10-01') },
    ]);
    expect(team.map((t) => [t.clinicianId, t.primary, t.via])).toEqual([['prescriber', true, 'PRESCRIBER'], ['reviewer', false, 'CONSULTATION'], ['locum', false, 'APPOINTMENT']]);
    expect(team[0].since).toEqual(at('2026-07-10'));
  });

  it('falls back to whoever reviewed the consultation before anything is prescribed, and to nobody for appointments alone', () => {
    expect(careTeamOf([{ clinicianId: 'reviewer', via: 'CONSULTATION', at: at('2026-07-01') }])[0].primary).toBe(true);
    expect(careTeamOf([{ clinicianId: 'locum', via: 'APPOINTMENT', at: at('2026-07-01') }])[0].primary).toBe(false);
    expect(careTeamOf([])).toEqual([]);
  });
});
