import { hematocritPercent, monitoringStatus, nextDueAt } from './trt-monitoring';

const DAY = 86_400_000;
const start = new Date('2026-01-01T00:00:00Z');
const at = (days: number) => new Date(start.getTime() + days * DAY);
const lab = (kind: string, value: number, days: number, unit = '') => ({ kind, value, unit, collectedAt: at(days) });
const allThree = (days: number) => [lab('TESTOSTERONE', 20, days, 'nmol/L'), lab('HEMATOCRIT', 45, days, '%'), lab('PSA', 1, days, 'ng/mL')];

describe('nextDueAt', () => {
  it('follows baseline, 3, 6 and 12 months, then yearly', () => {
    expect(nextDueAt(start, null)).toEqual(start); // baseline
    expect(nextDueAt(start, at(0))).toEqual(at(91)); // → 3 months
    expect(nextDueAt(start, at(91))).toEqual(at(182)); // → 6 months
    expect(nextDueAt(start, at(182))).toEqual(at(364)); // → 12 months
    expect(nextDueAt(start, at(364))).toEqual(at(729)); // → yearly
  });
});

describe('hematocritPercent', () => {
  it('accepts a percentage or a fraction', () => {
    expect(hematocritPercent(52)).toBe(52);
    expect(hematocritPercent(0.52)).toBeCloseTo(52);
  });
});

describe('monitoringStatus', () => {
  it('is clear when every test is up to date and in range', () => {
    const s = monitoringStatus(start, allThree(0), at(60));
    expect(s.holdReasons).toEqual([]);
    expect(s.warnings).toEqual([]);
    expect(s.kinds.map((k) => k.dueAt)).toEqual([at(91), at(91), at(91)]);
  });

  it('holds once a test is more than 30 days overdue, not before', () => {
    expect(monitoringStatus(start, allThree(0), at(91 + 30)).holdReasons).toEqual([]);
    const late = monitoringStatus(start, allThree(0), at(91 + 31));
    expect(late.holdReasons).toHaveLength(3);
    expect(late.holdReasons[0]).toMatch(/^Testosterone test overdue since/);
  });

  it('holds with no baseline results a month after starting', () => {
    expect(monitoringStatus(start, [], at(31)).holdReasons).toHaveLength(3);
  });

  it('holds when the latest haematocrit is above 54%, in either unit', () => {
    const high = monitoringStatus(start, [...allThree(0), lab('HEMATOCRIT', 0.56, 90, 'L/L')], at(95));
    expect(high.holdReasons).toEqual([expect.stringMatching(/^Haematocrit 56% is above 54%/)]);
    // A later normal result clears it.
    const recovered = monitoringStatus(start, [...allThree(0), lab('HEMATOCRIT', 56, 90), lab('HEMATOCRIT', 50, 100)], at(105));
    expect(recovered.holdReasons).toEqual([]);
  });

  it('warns on a PSA rise over 1.4 within a year, or above 4', () => {
    const rise = monitoringStatus(start, [...allThree(0), lab('PSA', 2.6, 91)], at(95));
    expect(rise.warnings).toEqual([expect.stringMatching(/^PSA rose 1.6 ng\/mL within 12 months/)]);
    expect(rise.holdReasons).toEqual([]);
    expect(monitoringStatus(start, [lab('PSA', 4.5, 0)], at(10)).warnings).toEqual([expect.stringMatching(/above 4/)]);
    // A rise spread over more than a year doesn't count.
    expect(monitoringStatus(start, [lab('PSA', 1, 0), lab('PSA', 2.6, 400)], at(401)).warnings).toEqual([]);
  });
});
