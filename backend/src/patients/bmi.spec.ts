import { bmiOf } from './bmi';

describe('bmiOf', () => {
  it('is weight over height squared, to one decimal', () => {
    expect(bmiOf(80, 180)).toBe(24.7);
    expect(bmiOf(220, 216)).toBe(47.2);
    expect(bmiOf(100, 170)).toBe(34.6);
  });

  it('is null when either figure is missing', () => {
    expect(bmiOf(null, 180)).toBeNull();
    expect(bmiOf(80, null)).toBeNull();
    expect(bmiOf(undefined, undefined)).toBeNull();
  });

  it('is null for a height or weight that cannot be real, rather than a wild number', () => {
    expect(bmiOf(80, 18)).toBeNull(); // 18 cm: probably metres or feet typed as cm
    expect(bmiOf(80, 1.8)).toBeNull();
    expect(bmiOf(80, 300)).toBeNull();
    expect(bmiOf(0, 180)).toBeNull();
    expect(bmiOf(-5, 180)).toBeNull();
  });
});
