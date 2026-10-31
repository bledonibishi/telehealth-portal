import { LAB_CASES } from './lab-eval-cases';
import { scoreReading } from './lab-eval-score';
import type { LabReading } from './lab-reader.service';

const trt = LAB_CASES.find((c) => c.name.startsWith('male TRT'))!;
const below = LAB_CASES.find((c) => c.name.startsWith('values below detection'))!;

/** A reading that is exactly the answer. */
const perfect = (c = trt): LabReading => ({
  readable: true,
  patientName: c.expect.patientName.toUpperCase(),
  labName: c.lab,
  reportDate: null,
  notes: '',
  results: c.expect.rows.map((e) => ({ kind: e.kind, analyteName: e.kind === 'OTHER' ? `Something ${e.name}` : null, value: e.value, unit: e.unit, referenceLow: e.low, referenceHigh: e.high, collectedOn: c.expect.collectedOn, flaggedByLab: e.flagged ?? null })),
});

describe('scoring a lab reading', () => {
  it('scores a perfect reading as all ok', () => {
    const s = scoreReading(trt, perfect());
    expect(s).toMatchObject({ left: 0, wrong: 0, blocking: [] });
    expect(s.ok).toBeGreaterThan(trt.expect.rows.length * 3);
  });

  it('blocks a wrong value', () => {
    const r = perfect();
    r.results[0].value = 15;
    expect(scoreReading(trt, r).blocking).toEqual(['testosterone: read 15, printed 28.4']);
  });

  it('blocks free testosterone filed as total testosterone', () => {
    const r = perfect();
    r.results[1] = { ...r.results[1], kind: 'TESTOSTERONE', analyteName: null };
    expect(scoreReading(trt, r).blocking.join()).toMatch(/free \(other\) 512 was read as TESTOSTERONE/);
  });

  it('blocks a guessed number for a value printed as "<18"', () => {
    const r = perfect(below);
    r.results.push({ kind: 'ESTRADIOL', analyteName: null, value: 18, unit: 'pmol/L', referenceLow: 100, referenceHigh: 700, collectedOn: '2026-10-02', flaggedByLab: true });
    expect(scoreReading(below, r).blocking.join()).toMatch(/not printed as a number: ESTRADIOL 18/);
  });

  it('counts a row it did not read as left, not wrong', () => {
    const r = perfect();
    r.results.splice(2, 1);
    expect(scoreReading(trt, r)).toMatchObject({ left: 1, wrong: 0, blocking: [] });
  });

  it('treats a wrong range or flag as wrong but not blocking', () => {
    const r = perfect();
    r.results[0].referenceHigh = 30;
    r.results[3].flaggedByLab = false;
    expect(scoreReading(trt, r)).toMatchObject({ wrong: 2, blocking: [] });
  });

  it('marks a collection date given where only a print date is shown', () => {
    const printOnly = LAB_CASES.find((c) => c.expect.collectedOn === null)!;
    const r = perfect(printOnly);
    for (const row of r.results) row.collectedOn = '2026-10-11';
    expect(scoreReading(printOnly, r).problems.join()).toMatch(/only a print date/);
  });
});

describe('the lab test reports', () => {
  it('are unique, and every printed numeric row is in the answer (so anything else read was invented)', () => {
    expect(new Set(LAB_CASES.map((c) => c.name)).size).toBe(LAB_CASES.length);
    for (const c of LAB_CASES) {
      const numeric = c.rows.filter(([, result]) => /^\d/.test(result));
      expect(c.expect.rows).toHaveLength(numeric.length);
    }
  });
});
