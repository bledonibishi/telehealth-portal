import { ROUTINE_RESPONSE_HOURS, URGENT_RESPONSE_HOURS, byPriority, triage } from './triage';

const NOW = new Date('2026-10-05T09:00:00Z');
const hoursFrom = (d: Date) => (d.getTime() - NOW.getTime()) / 3_600_000;

describe('triage', () => {
  it('answers a plain question within 3 days', () => {
    const t = triage({ reason: 'QUESTION' }, NOW);
    expect(t).toMatchObject({ urgency: 'ROUTINE', emergencyAdvised: false });
    expect(hoursFrom(t.respondBy)).toBe(ROUTINE_RESPONSE_HOURS);
  });

  it('answers within 24 hours when the patient says it can’t wait, or the pain is 7 or more', () => {
    expect(triage({ reason: 'QUESTION', urgent: true }, NOW).urgency).toBe('URGENT');
    expect(triage({ reason: 'PAIN', painLevel: 6 }, NOW).urgency).toBe('ROUTINE');
    const t = triage({ reason: 'PAIN', painLevel: 7 }, NOW);
    expect(t.urgency).toBe('URGENT');
    expect(hoursFrom(t.respondBy)).toBe(URGENT_RESPONSE_HOURS);
  });

  it('sends warning signs to emergency services and still makes the request urgent', () => {
    expect(triage({ reason: 'SIDE_EFFECT', redFlags: ['chest_pain'] }, NOW)).toMatchObject({ urgency: 'URGENT', emergencyAdvised: true });
  });

  it('ignores warning-sign keys it doesn’t know', () => {
    expect(triage({ reason: 'OTHER', redFlags: ['made_up'] }, NOW)).toMatchObject({ urgency: 'ROUTINE', emergencyAdvised: false });
  });
});

describe('byPriority', () => {
  it('puts urgent first, then the soonest due', () => {
    const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
    const rows = [
      { id: 'routine-soon', urgency: 'ROUTINE', respondBy: at(1) },
      { id: 'urgent-late', urgency: 'URGENT', respondBy: at(20) },
      { id: 'urgent-soon', urgency: 'URGENT', respondBy: at(2) },
    ];
    expect(rows.sort(byPriority).map((r) => r.id)).toEqual(['urgent-soon', 'urgent-late', 'routine-soon']);
  });
});
