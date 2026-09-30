import { SCALES, domainScores, maxScore, minScore, scaleForKind, severityOf, validateAnswers } from './symptom-scales';

const all = (scaleId: 'MRS' | 'AMS', score: number) => SCALES[scaleId].items.map((i) => ({ itemId: i.id, score }));

describe('symptom scales', () => {
  it('matches the published score ranges', () => {
    expect([minScore(SCALES.MRS), maxScore(SCALES.MRS)]).toEqual([0, 44]);
    expect([minScore(SCALES.AMS), maxScore(SCALES.AMS)]).toEqual([17, 85]);
  });

  it('puts every item in a declared domain, with unique ids', () => {
    for (const s of Object.values(SCALES)) {
      const domains = new Set(s.domains.map((d) => d.id));
      expect(s.items.every((i) => domains.has(i.domain))).toBe(true);
      expect(new Set(s.items.map((i) => i.id)).size).toBe(s.items.length);
    }
  });

  it('picks the scale for the programme', () => {
    expect(scaleForKind('HRT')?.id).toBe('MRS');
    expect(scaleForKind('TRT')?.id).toBe('AMS');
    expect(scaleForKind('GLP1')).toBeNull();
    expect(scaleForKind(null)).toBeNull();
  });

  it('bands severity on the total', () => {
    expect(severityOf(SCALES.MRS, 0)).toBe('Little or none');
    expect(severityOf(SCALES.MRS, 8)).toBe('Mild');
    expect(severityOf(SCALES.MRS, 9)).toBe('Moderate');
    expect(severityOf(SCALES.MRS, 30)).toBe('Severe');
    expect(severityOf(SCALES.AMS, 17)).toBe('Little or none');
    expect(severityOf(SCALES.AMS, 50)).toBe('Severe');
  });
});

describe('validateAnswers', () => {
  it('accepts a complete set and returns it in item order', () => {
    const answers = all('MRS', 2).reverse();
    const r = validateAnswers(SCALES.MRS, answers);
    expect(r.errors).toEqual([]);
    expect(r.answers.map((a) => a.itemId)).toEqual(SCALES.MRS.items.map((i) => i.id));
  });

  it('rejects missing, duplicate, unknown and out-of-range answers', () => {
    const answers = all('MRS', 1);
    expect(validateAnswers(SCALES.MRS, answers.slice(1)).errors.join(' ')).toMatch(/1 left/);
    expect(validateAnswers(SCALES.MRS, [...answers, answers[0]]).errors.join(' ')).toMatch(/more than once/);
    expect(validateAnswers(SCALES.MRS, [...answers, { itemId: 'nope', score: 1 }]).errors.join(' ')).toMatch(/Unknown/);
    expect(validateAnswers(SCALES.MRS, [{ ...answers[0], score: 5 }, ...answers.slice(1)]).errors.join(' ')).toMatch(/invalid score/);
    // AMS starts at 1, so 0 is not a valid answer there.
    expect(validateAnswers(SCALES.AMS, all('AMS', 0)).errors.length).toBeGreaterThan(0);
  });
});

describe('domainScores', () => {
  it('sums each domain with its own range', () => {
    const d = domainScores(SCALES.MRS, all('MRS', 4));
    expect(d).toEqual([
      { domain: 'somatic', label: 'Physical', score: 16, min: 0, max: 16 },
      { domain: 'psychological', label: 'Mood', score: 16, min: 0, max: 16 },
      { domain: 'urogenital', label: 'Urogenital', score: 12, min: 0, max: 12 },
    ]);
    const ams = domainScores(SCALES.AMS, all('AMS', 1));
    expect(ams.reduce((s, x) => s + x.score, 0)).toBe(17);
  });
});
