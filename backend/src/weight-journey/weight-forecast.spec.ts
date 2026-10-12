import { forecastWeight } from './weight-forecast';

const NOW = new Date('2026-10-01T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
/** One measurement every `every` days for `count` entries, ending today, losing `perWeek` kg a week. */
const series = (start: number, perWeek: number, count: number, every = 7, noise: number[] = []) =>
  Array.from({ length: count }, (_, i) => {
    const age = (count - 1 - i) * every;
    const elapsed = (count - 1) * every - age;
    return { measuredAt: daysAgo(age), weightKg: start - (perWeek / 7) * elapsed + (noise[i] ?? 0) };
  });

describe('forecastWeight', () => {
  it('carries a steady loss forward month by month', () => {
    const f = forecastWeight(series(100, 0.7, 8), { now: NOW });
    if (!f.available) throw new Error('expected a forecast');
    expect(f.kgPerWeek).toBeCloseTo(-0.7, 1);
    expect(f.confidence).toBe('HIGH');
    expect(f.points).toHaveLength(6);
    expect(f.points.map((p) => p.monthsAhead)).toEqual([1, 2, 3, 4, 5, 6]);
    // today is 95.1; 3 months at 0.7 kg/week ≈ 9.1 kg off, 6 months ≈ 18.3
    expect(f.from.weightKg).toBeCloseTo(95.1, 1);
    expect(f.points[2].weightKg).toBeCloseTo(86, 0);
    expect(f.points[5].weightKg).toBeCloseTo(76.8, 0);
    expect(f.points[0].at.getTime()).toBeGreaterThan(NOW.getTime() - 1);
  });

  it('never projects past the target weight, and says when it would be reached', () => {
    const f = forecastWeight(series(100, 0.7, 8), { now: NOW, targetKg: 90 });
    if (!f.available) throw new Error('expected a forecast');
    expect(Math.min(...f.points.map((p) => p.weightKg))).toBe(90);
    expect(f.points[5].weightKg).toBe(90);
    expect(f.reachesTargetAt).not.toBeNull();
    expect(f.reachesTargetAt!.getTime()).toBeLessThan(f.points[5].at.getTime());
  });

  it('has no reached-on date when the target is out of reach in 6 months', () => {
    const f = forecastWeight(series(100, 0.3, 8), { now: NOW, targetKg: 70 });
    if (!f.available) throw new Error('expected a forecast');
    expect(f.reachesTargetAt).toBeNull();
  });

  it('without a target, stops at 70% of today’s weight', () => {
    const f = forecastWeight(series(100, 1.4, 14), { now: NOW });
    if (!f.available) throw new Error('expected a forecast');
    expect(f.points[5].weightKg).toBeGreaterThanOrEqual(Math.round(f.from.weightKg * 0.7 * 10) / 10);
  });

  it('trusts a bumpy trend less', () => {
    // about a kilo off the line on a typical day
    const bumpy = series(100, 0.5, 8, 7, [0, 1.2, -1, 1.3, -1.1, 1, -1.2, 0.9]);
    const f = forecastWeight(bumpy, { now: NOW });
    if (!f.available) throw new Error('expected a forecast');
    expect(f.confidence).toBe('MEDIUM');
  });

  it('shows no forecast when the weigh-ins jump about too much to say anything', () => {
    const wild = series(100, 0.5, 8, 7, [0, 6, -5, 7, -6, 5, -7, 6]);
    expect(forecastWeight(wild, { now: NOW })).toEqual({ available: false, reason: 'TOO_VARIABLE' });
  });

  it('is not thrown by one mistyped weight', () => {
    const typo = series(100, 0.7, 9, 7);
    typo[4] = { ...typo[4], weightKg: 220 };
    const f = forecastWeight(typo, { now: NOW });
    if (!f.available) throw new Error('expected a forecast');
    expect(f.kgPerWeek).toBeCloseTo(-0.7, 1);
    expect(f.points[5].weightKg).toBeGreaterThan(70);
  });

  it('holds an unbelievable pace to 1.5% of body weight a week', () => {
    const f = forecastWeight(series(100, 1.8, 6), { now: NOW });
    if (!f.available) throw new Error('expected a forecast');
    expect(f.kgPerWeek).toBeGreaterThanOrEqual(-1.4);
    expect(f.kgPerWeek).toBeLessThanOrEqual(-1.3);
    // and a pace far past that is not a believable series at all
    expect(forecastWeight(series(100, 4, 6), { now: NOW })).toEqual({ available: false, reason: 'TOO_VARIABLE' });
  });

  it('needs at least three measurements over two weeks', () => {
    expect(forecastWeight(series(100, 0.7, 2), { now: NOW })).toEqual({ available: false, reason: 'NOT_ENOUGH_DATA' });
    // five weigh-ins but all within a week
    expect(forecastWeight(series(100, 0.7, 5, 1), { now: NOW })).toEqual({ available: false, reason: 'NOT_ENOUGH_DATA' });
    expect(forecastWeight([], { now: NOW })).toEqual({ available: false, reason: 'NOT_ENOUGH_DATA' });
  });

  it('does not project a flat or rising trend', () => {
    expect(forecastWeight(series(100, 0, 6), { now: NOW })).toEqual({ available: false, reason: 'NOT_LOSING' });
    expect(forecastWeight(series(100, -0.4, 6), { now: NOW })).toEqual({ available: false, reason: 'NOT_LOSING' });
  });

  it('uses only the last 90 days, and ignores anything dated in the future', () => {
    const old = series(120, 0, 5, 7).map((m) => ({ ...m, measuredAt: daysAgo(200 + (m.measuredAt.getTime() % 7)) }));
    const future = [{ measuredAt: new Date(NOW.getTime() + 5 * 86_400_000), weightKg: 20 }];
    const f = forecastWeight([...old, ...series(100, 0.7, 8), ...future], { now: NOW });
    if (!f.available) throw new Error('expected a forecast');
    expect(f.basedOnPoints).toBe(8);
    expect(f.kgPerWeek).toBeCloseTo(-0.7, 1);
  });
});
