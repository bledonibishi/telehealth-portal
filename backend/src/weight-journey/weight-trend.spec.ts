import { GAIN_PCT_28_DAYS, assessWeightTrend } from './weight-trend';

const NOW = new Date('2026-11-01T09:00:00Z');
const DAY = 86_400_000;
/** One weigh-in every `every` days going back, with the weights given oldest first. */
const series = (weights: number[], every = 7) => weights.map((weightKg, i) => ({ measuredAt: new Date(NOW.getTime() - (weights.length - 1 - i) * every * DAY), weightKg }));

describe('assessWeightTrend', () => {
  it('has nothing to say with fewer than three weights, or less than two weeks of them', () => {
    expect(assessWeightTrend(series([100]), { now: NOW }).level).toBe('TOO_FEW');
    expect(assessWeightTrend(series([100, 99.5]), { now: NOW }).level).toBe('TOO_FEW');
    expect(assessWeightTrend(series([100, 99.8, 99.6], 2), { now: NOW }).level).toBe('TOO_FEW'); // 4 days
  });

  it('flags a steady rise: 100 kg to 104.5 over 4 weeks is +4.5%, and the doctor is told', () => {
    const t = assessWeightTrend(series([100, 101.1, 102.2, 103.4, 104.5]), { now: NOW });
    expect(t.level).toBe('GAIN');
    expect(t.notifyDoctor).toBe(true);
    expect(t.changePct28Days).toBeGreaterThanOrEqual(GAIN_PCT_28_DAYS);
    expect(t.kgIn3Months).toBeGreaterThan(10);
  });

  it('does not sound the alarm for a small drift: +0.1 kg a week is holding, not gain', () => {
    const t = assessWeightTrend(series([100, 100.1, 100.2, 100.3, 100.4]), { now: NOW });
    expect(t.level).toBe('HOLDING');
    expect(t.notifyDoctor).toBe(false);
  });

  it('reads 120 kg to 220 kg in a week as a likely typo to check, not as a 100 kg gain', () => {
    const t = assessWeightTrend([...series([120, 119, 118], 7).map((m) => ({ ...m, measuredAt: new Date(m.measuredAt.getTime() - 7 * DAY) })), { measuredAt: new Date(NOW.getTime() - 3 * DAY), weightKg: 118 }, { measuredAt: NOW, weightKg: 220 }], { now: NOW });
    expect(t).toMatchObject({ level: 'CHECK_ENTRY', latestKg: 220, previousKg: 118, notifyDoctor: false });
    expect(t.jumpPct).toBeGreaterThan(80);
  });

  it('is not thrown by one mistyped weight in the middle: the median trend ignores it', () => {
    const t = assessWeightTrend(series([100, 99, 98, 150, 96, 95, 94, 93]), { now: NOW });
    expect(t.level).not.toBe('GAIN');
    expect(t.kgPerWeek).toBeLessThan(0);
  });

  it('calls a loss of half a kilo a week or more steady, with where it leads', () => {
    const t = assessWeightTrend(series([100, 99, 98, 97, 96]), { now: NOW, targetKg: 80 });
    expect(t).toMatchObject({ level: 'STEADY_LOSS', unusuallyFast: false, notifyDoctor: false });
    expect(t.kgPerWeek).toBe(-1);
    expect(t.kgIn3Months).toBeLessThan(96);
  });

  it('notes a loss faster than is usual, instead of cheering it', () => {
    const t = assessWeightTrend(series([100, 96.5, 93, 89.5, 86]), { now: NOW });
    expect(t).toMatchObject({ level: 'STEADY_LOSS', unusuallyFast: true });
  });

  it('says holding steady for a flat weight, which is not the same as scattered', () => {
    expect(assessWeightTrend(series([100, 100, 100.1, 99.9, 100]), { now: NOW }).level).toBe('HOLDING');
  });

  it('says scattered when the weights jump about too much to draw a line', () => {
    const t = assessWeightTrend(series([100, 106, 98, 105, 97, 106, 102]), { now: NOW });
    expect(t.level).toBe('UNSTABLE');
    expect(t.notifyDoctor).toBe(false);
  });

  it('never divides by zero when everything is logged at once', () => {
    const same = Array.from({ length: 4 }, () => ({ measuredAt: NOW, weightKg: 100 }));
    expect(() => assessWeightTrend(same, { now: NOW })).not.toThrow();
    expect(assessWeightTrend(same, { now: NOW }).level).toBe('TOO_FEW');
  });

  it('ignores weights older than 90 days and any in the future', () => {
    const old = [{ measuredAt: new Date(NOW.getTime() - 200 * DAY), weightKg: 60 }, { measuredAt: new Date(NOW.getTime() + 5 * DAY), weightKg: 300 }];
    expect(assessWeightTrend([...old, ...series([100, 100, 100])], { now: NOW }).level).toBe('HOLDING');
  });
});
