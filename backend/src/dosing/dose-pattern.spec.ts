import { dosePattern, nextDoseDates } from './dose-pattern';

const DAY = 86_400_000;

describe('dosePattern', () => {
  it('uses the fixed interval when there is one', () => {
    expect(dosePattern({ doseIntervalDays: 7, dosesPerWeek: 2 })).toEqual({ cycleDays: 7, offsets: [0] });
  });

  it('spreads doses per week over whole days', () => {
    expect(dosePattern({ dosesPerWeek: 2 })).toEqual({ cycleDays: 7, offsets: [0, 3] });
    expect(dosePattern({ dosesPerWeek: 3 })).toEqual({ cycleDays: 7, offsets: [0, 2, 4] });
  });

  it('has no pattern without a schedule, or with a nonsensical one', () => {
    expect(dosePattern({})).toBeNull();
    expect(dosePattern({ dosesPerWeek: 0 })).toBeNull();
    expect(dosePattern({ dosesPerWeek: 8 })).toBeNull();
  });
});

describe('nextDoseDates', () => {
  const start = new Date('2026-10-05T09:00:00Z'); // a Monday

  it('includes the series start when there is nothing before it', () => {
    const dates = nextDoseDates({ cycleDays: 7, offsets: [0, 3] }, start, null, 3);
    expect(dates.map((d) => d.getTime() - start.getTime())).toEqual([0, 3 * DAY, 7 * DAY]);
  });

  it('continues strictly after a given date, mid-cycle', () => {
    const afterThursday = new Date(start.getTime() + 17 * DAY); // Thursday of week 3
    const dates = nextDoseDates({ cycleDays: 7, offsets: [0, 3] }, start, afterThursday, 2);
    expect(dates.map((d) => (d.getTime() - start.getTime()) / DAY)).toEqual([21, 24]);
  });

  it('matches plain interval stepping for single-dose cycles', () => {
    const dates = nextDoseDates({ cycleDays: 1, offsets: [0] }, start, start, 3);
    expect(dates.map((d) => (d.getTime() - start.getTime()) / DAY)).toEqual([1, 2, 3]);
  });
});
