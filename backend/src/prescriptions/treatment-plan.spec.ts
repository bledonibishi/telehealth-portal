import { frequencyOf, planSpan, supplyDoses } from './treatment-plan';

describe('frequencyOf', () => {
  it('reads a dose interval or a set number a week', () => {
    expect(frequencyOf({ doseIntervalDays: 7, dosesPerWeek: null }, '')).toEqual({ label: 'Once a week', dosesPerWeek: 1 });
    expect(frequencyOf({ doseIntervalDays: 1, dosesPerWeek: null }, '')).toEqual({ label: 'Once a day', dosesPerWeek: 7 });
    expect(frequencyOf({ doseIntervalDays: null, dosesPerWeek: 2 }, '')).toEqual({ label: 'Twice a week', dosesPerWeek: 2 });
    expect(frequencyOf({ doseIntervalDays: null, dosesPerWeek: null }, 'As directed')).toEqual({ label: 'As directed', dosesPerWeek: null });
  });
});

describe('planSpan', () => {
  const start = new Date('2026-09-12T00:00:00Z');
  it('counts weeks done and the doses a 12-week weekly plan holds', () => {
    const end = new Date(start.getTime() + 12 * 7 * 86_400_000);
    expect(planSpan(start, end, 1, new Date('2026-10-05T00:00:00Z'))).toEqual({ weeksElapsed: 3, durationWeeks: 12, dosesPlanned: 12 });
  });
  it('has no length or total without an end date', () => {
    expect(planSpan(start, null, 1, start)).toEqual({ weeksElapsed: 0, durationWeeks: null, dosesPlanned: null });
  });
});

describe('supplyDoses', () => {
  it('uses the schedule when it covers the supply, and the expected count when it does not yet', () => {
    expect(supplyDoses([{ status: 'TAKEN' }, { status: 'TAKEN' }, { status: 'SCHEDULED' }, { status: 'SCHEDULED' }], 30, 1)).toEqual({ total: 4, taken: 2 });
    expect(supplyDoses([{ status: 'TAKEN' }], 30, 1)).toEqual({ total: 4, taken: 1 });
    expect(supplyDoses([], 30, null)).toBeNull();
  });
});
