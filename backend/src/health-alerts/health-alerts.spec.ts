import { type AlertInput, CHECK_IN_OVERDUE_AFTER_DAYS, NAMES_PER_GROUP, buildHealthAlerts } from './health-alerts';

const NOW = new Date('2026-11-02T09:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const daysAhead = (d: number) => new Date(NOW.getTime() + d * 86_400_000);
const P = (id: string, name = id) => ({ id, name });
const input = (over: Partial<AlertInput> = {}): AlertInput => ({ weightTrends: [], severeReports: [], pendingReviews: [], overdueCheckIns: [], expiringPrescriptions: [], ...over });

describe('buildHealthAlerts', () => {
  it('is empty when there is nothing to look at', () => {
    expect(buildHealthAlerts(input(), NOW)).toEqual([]);
  });

  it('raises a red alert for a sustained weight gain, and an orange one for a weight to double-check', () => {
    const alerts = buildHealthAlerts(input({
      weightTrends: [
        { patient: P('a', 'Ana'), level: 'GAIN', changePct28Days: 4.5, latestKg: null, previousKg: null },
        { patient: P('b', 'Ben'), level: 'CHECK_ENTRY', changePct28Days: null, latestKg: 220, previousKg: 118 },
        { patient: P('c', 'Cleo'), level: 'STEADY_LOSS', changePct28Days: -3, latestKg: null, previousKg: null },
        { patient: P('d', 'Dan'), level: 'HOLDING', changePct28Days: 0.2, latestKg: null, previousKg: null },
      ],
    }), NOW);
    expect(alerts.map((a) => [a.level, a.kind, a.patients[0].name])).toEqual([['RED', 'WEIGHT_GAIN', 'Ana'], ['ORANGE', 'WEIGHT_ENTRY_CHECK', 'Ben']]);
    expect(alerts[0].value).toBe(4.5);
    expect(alerts[1]).toMatchObject({ value: 220, other: 118 });
  });

  it('raises one red alert per patient with an unacknowledged severe side effect, merging their reports', () => {
    const alerts = buildHealthAlerts(input({ severeReports: [{ patient: P('a'), effects: ['vomiting'] }, { patient: P('a'), effects: ['abdominal_pain', 'vomiting'] }, { patient: P('b'), effects: ['nausea'] }] }), NOW);
    expect(alerts).toHaveLength(2);
    expect(alerts.find((a) => a.patients[0].id === 'a')?.effects.sort()).toEqual(['abdominal_pain', 'vomiting']);
  });

  it('counts consultations waiting a full day or more, with how long on average, and ignores newer ones', () => {
    const alerts = buildHealthAlerts(input({ pendingReviews: [{ patient: P('a'), submittedAt: hoursAgo(72) }, { patient: P('b'), submittedAt: hoursAgo(24) }, { patient: P('c'), submittedAt: hoursAgo(5) }] }), NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'YELLOW', kind: 'PENDING_REVIEWS', count: 2, value: 2 });
  });

  it('groups overdue check-ins by patient', () => {
    const alerts = buildHealthAlerts(input({ overdueCheckIns: [{ patient: P('a') }, { patient: P('a') }, { patient: P('b') }] }), NOW);
    expect(alerts[0]).toMatchObject({ level: 'YELLOW', kind: 'OVERDUE_CHECK_INS', count: 2 });
    expect(CHECK_IN_OVERDUE_AFTER_DAYS).toBe(2);
  });

  it('lists prescriptions ending within a week, soonest first, and not ones already past or further off', () => {
    const alerts = buildHealthAlerts(input({
      expiringPrescriptions: [
        { patient: P('late', 'Later'), validUntil: daysAhead(6) },
        { patient: P('soon', 'Sooner'), validUntil: daysAhead(2) },
        { patient: P('far', 'Far'), validUntil: daysAhead(30) },
        { patient: P('gone', 'Gone'), validUntil: daysAhead(-1) },
      ],
    }), NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'ORANGE', kind: 'PRESCRIPTIONS_EXPIRING', count: 2 });
    expect(alerts[0].patients.map((p) => p.name)).toEqual(['Sooner', 'Later']);
  });

  it('names only the first few patients of a big group, while the count covers everyone', () => {
    const many = Array.from({ length: NAMES_PER_GROUP + 5 }, (_, i) => ({ patient: P(`p${i}`) }));
    const [alert] = buildHealthAlerts(input({ overdueCheckIns: many }), NOW);
    expect(alert.count).toBe(NAMES_PER_GROUP + 5);
    expect(alert.patients).toHaveLength(NAMES_PER_GROUP);
  });

  it('puts red first, then yellow, then orange, and the biggest weight rise first among the reds', () => {
    const alerts = buildHealthAlerts(input({
      weightTrends: [
        { patient: P('small'), level: 'GAIN', changePct28Days: 3.2, latestKg: null, previousKg: null },
        { patient: P('big'), level: 'GAIN', changePct28Days: 8, latestKg: null, previousKg: null },
        { patient: P('typo'), level: 'CHECK_ENTRY', changePct28Days: null, latestKg: 200, previousKg: 100 },
      ],
      pendingReviews: [{ patient: P('q'), submittedAt: hoursAgo(48) }],
    }), NOW);
    expect(alerts.map((a) => a.id)).toEqual(['WEIGHT_GAIN:big', 'WEIGHT_GAIN:small', 'PENDING_REVIEWS', 'WEIGHT_ENTRY_CHECK:typo']);
  });
});
