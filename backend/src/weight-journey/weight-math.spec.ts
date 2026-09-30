import { computeProgress, motivationMessage } from './weight-math';

describe('computeProgress', () => {
  it('matches the worked example: 120 → 105 with a target of 90 is 50%', () => {
    expect(computeProgress(120, 90, 105)).toEqual({ weightLostKg: 15, remainingKg: 15, progressPercentage: 50 });
  });

  it('matches the month-by-month example (start 120, target 90)', () => {
    expect(computeProgress(120, 90, 114)).toEqual({ weightLostKg: 6, remainingKg: 24, progressPercentage: 20 });
    expect(computeProgress(120, 90, 109)).toEqual({ weightLostKg: 11, remainingKg: 19, progressPercentage: 36.67 });
    expect(computeProgress(120, 90, 105)).toEqual({ weightLostKg: 15, remainingKg: 15, progressPercentage: 50 });
  });

  it('is 100% at the target and never exceeds it below the target', () => {
    expect(computeProgress(120, 90, 90)).toEqual({ weightLostKg: 30, remainingKg: 0, progressPercentage: 100 });
    expect(computeProgress(120, 90, 88.5)).toEqual({ weightLostKg: 31.5, remainingKg: 0, progressPercentage: 100 });
  });

  it('never goes below 0% if the patient has gained weight', () => {
    const p = computeProgress(120, 90, 123)!;
    expect(p.progressPercentage).toBe(0);
    expect(p.weightLostKg).toBe(-3);
    expect(p.remainingKg).toBe(33);
  });

  it('handles decimal weights', () => {
    expect(computeProgress(100, 90, 96.2)).toEqual({ weightLostKg: 3.8, remainingKg: 6.2, progressPercentage: 38 });
  });

  it('is unusable when the target is not below the starting weight', () => {
    expect(computeProgress(90, 90, 90)).toBeNull();
    expect(computeProgress(90, 100, 85)).toBeNull();
  });
});

describe('motivationMessage', () => {
  const at = (pct: number, lost = 5) => ({ weightLostKg: lost, remainingKg: 1, progressPercentage: pct });

  it('picks calm copy by milestone', () => {
    expect(motivationMessage(null)).toMatch(/starts today/);
    expect(motivationMessage(at(10))).toMatch(/making progress/);
    expect(motivationMessage(at(25))).toMatch(/25%/);
    expect(motivationMessage(at(50))).toMatch(/Halfway/);
    expect(motivationMessage(at(75))).toMatch(/closer/);
    expect(motivationMessage(at(100))).toMatch(/Congratulations/);
  });

  it('does not congratulate progress a patient has not made', () => {
    expect(motivationMessage(at(0, -3))).toMatch(/starts today/);
  });
});
