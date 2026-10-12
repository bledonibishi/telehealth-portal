import { median, summarisePerformance } from './clinician-performance';

const clin = (id: string, role = 'DOCTOR') => ({ id, firstName: id, lastName: 'X', email: `${id}@c.dev`, role, isVerified: true });
const empty = { prescriptionsIssued: new Map(), checkInsReviewed: new Map(), openCases: new Map() };

describe('median', () => {
  it('handles odd, even and empty lists', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('summarisePerformance', () => {
  it('counts decisions, approval rate and response time per doctor', () => {
    const [chen] = summarisePerformance({
      clinicians: [clin('chen')],
      decisions: [
        { clinicianId: 'chen', action: 'CONSULTATION_APPROVED', minutes: 30 },
        { clinicianId: 'chen', action: 'CONSULTATION_APPROVED', minutes: 90 },
        { clinicianId: 'chen', action: 'CONSULTATION_DECLINED', minutes: 60 },
        { clinicianId: 'chen', action: 'CONSULTATION_MORE_INFO_REQUESTED', minutes: 5 },
        { clinicianId: 'someone-else', action: 'CONSULTATION_APPROVED', minutes: 1 },
      ],
      ...empty,
      prescriptionsIssued: new Map([['chen', 2]]),
      checkInsReviewed: new Map([['chen', 4]]),
      openCases: new Map([['chen', 1]]),
    });
    expect(chen).toMatchObject({
      status: 'ACTIVE', casesDecided: 3, approved: 2, declined: 1, moreInfoRequests: 1,
      approvalRate: 66.7, avgDecisionMinutes: 60, medianDecisionMinutes: 60,
      prescriptionsIssued: 2, checkInsReviewed: 4, openCases: 1,
    });
  });

  it('marks someone with no activity in the period as inactive, with no rates to show', () => {
    const [idle] = summarisePerformance({ clinicians: [clin('idle')], decisions: [], ...empty });
    expect(idle).toMatchObject({ status: 'INACTIVE', casesDecided: 0, approvalRate: null, avgDecisionMinutes: null });
  });

  it('ignores decisions whose consultation could not be found when timing, but still counts them', () => {
    const [row] = summarisePerformance({
      clinicians: [clin('a')],
      decisions: [{ clinicianId: 'a', action: 'CONSULTATION_APPROVED', minutes: null }, { clinicianId: 'a', action: 'CONSULTATION_APPROVED', minutes: 20 }],
      ...empty,
    });
    expect(row.casesDecided).toBe(2);
    expect(row.avgDecisionMinutes).toBe(20);
  });

  it('lists the busiest doctor first', () => {
    const rows = summarisePerformance({
      clinicians: [clin('quiet'), clin('busy')],
      decisions: [{ clinicianId: 'busy', action: 'CONSULTATION_APPROVED', minutes: 1 }],
      ...empty,
    });
    expect(rows.map((r) => r.clinicianId)).toEqual(['busy', 'quiet']);
  });
});
