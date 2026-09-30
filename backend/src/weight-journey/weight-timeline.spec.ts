import { latestOf, RawMeasurement, sortMeasurements, withChanges } from './weight-timeline';

const m = (id: string, iso: string, weightKg: number, kind: 'DAILY' | 'CHECK_IN' = 'DAILY'): RawMeasurement => ({ id, measuredAt: new Date(iso), weightKg, kind });

describe('sortMeasurements', () => {
  it('orders by exact time, oldest first, mixing daily entries and check-ins', () => {
    const out = sortMeasurements([m('c', '2026-09-29T07:51:00Z', 109), m('a', '2026-09-01T10:00:00Z', 114, 'CHECK_IN'), m('b', '2026-09-28T08:32:00Z', 109.4)]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps several entries on the same day distinct and in time order', () => {
    const out = sortMeasurements([m('pm', '2026-09-29T19:00:00Z', 108.8), m('am', '2026-09-29T07:51:00Z', 109.2)]);
    expect(out.map((x) => x.id)).toEqual(['am', 'pm']);
  });

  it('is stable for an identical instant (check-in first, then daily) and does not mutate its input', () => {
    const input = [m('d', '2026-09-29T07:00:00Z', 109), m('c', '2026-09-29T07:00:00Z', 110, 'CHECK_IN')];
    expect(sortMeasurements(input).map((x) => x.id)).toEqual(['c', 'd']);
    expect(input.map((x) => x.id)).toEqual(['d', 'c']);
  });
});

describe('withChanges', () => {
  it('compares each weighing with the one before, and the first with `before`', () => {
    const out = withChanges(sortMeasurements([m('1', '2026-09-27T08:00:00Z', 109.4), m('2', '2026-09-28T08:00:00Z', 109.0), m('3', '2026-09-29T08:00:00Z', 109.6)]), 110);
    expect(out.map((x) => x.changeKg)).toEqual([-0.6, -0.4, 0.6]);
  });

  it('has no change when there is nothing before', () => {
    expect(withChanges([m('1', '2026-09-27T08:00:00Z', 109.4)], null)[0].changeKg).toBeNull();
  });

  it('rounds away floating-point noise (109.4 - 109.3 is 0.1)', () => {
    expect(withChanges([m('1', '2026-09-27T08:00:00Z', 109.4)], 109.3)[0].changeKg).toBe(0.1);
  });
});

describe('latestOf', () => {
  it('picks the later instant regardless of kind', () => {
    const d = { measuredAt: new Date('2026-09-20T00:00:00Z'), kind: 'DAILY' as const };
    const c = { measuredAt: new Date('2026-09-25T00:00:00Z'), kind: 'CHECK_IN' as const };
    expect(latestOf(d, c)).toBe(c);
    expect(latestOf(c, d)).toBe(c);
  });

  it('handles a missing side, and prefers the daily entry on an exact tie', () => {
    const t = new Date('2026-09-25T00:00:00Z');
    const d = { measuredAt: t, kind: 'DAILY' as const };
    const c = { measuredAt: t, kind: 'CHECK_IN' as const };
    expect(latestOf(null, c)).toBe(c);
    expect(latestOf(d, null)).toBe(d);
    expect(latestOf(null, null)).toBeNull();
    expect(latestOf(c, d)).toBe(d);
  });
});
