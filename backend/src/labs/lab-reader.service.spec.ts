import { LabReaderService, nameMatches, printedMismatch, toReading } from './lab-reader.service';

describe('toReading', () => {
  const good = { kind: 'ESTRADIOL', analyte_name: null, value: 340, unit: ' pmol/L ', reference_low: 100, reference_high: 700, collected_on: '2026-09-30', flagged_by_lab: false };

  it('keeps a clean row and tidies it', () => {
    const r = toReading({ readable: true, patient_name: ' Alma Krasniqi ', lab_name: 'Lab', report_date: '2026-10-01', results: [good], notes: 'ok' });
    expect(r.results).toEqual([{ kind: 'ESTRADIOL', analyteName: null, value: 340, unit: 'pmol/L', referenceLow: 100, referenceHigh: 700, collectedOn: '2026-09-30', flaggedByLab: false }]);
    expect(r.patientName).toBe('Alma Krasniqi');
  });

  it('drops what cannot be trusted rather than guessing', () => {
    const r = toReading({
      readable: true,
      results: [
        good,
        { ...good, value: 'high' }, // not a number
        { ...good, unit: '' }, // no unit
        { ...good, kind: 'OTHER', analyte_name: '' }, // an "other" test with no name
        { ...good, kind: 'MADE_UP', analyte_name: 'ALT', value: 31, unit: 'U/L' }, // an unknown kind becomes OTHER, keeping its name
      ],
    });
    expect(r.results.map((x) => [x.kind, x.analyteName, x.value])).toEqual([['ESTRADIOL', null, 340], ['OTHER', 'ALT', 31]]);
  });

  it('ignores impossible dates and a reversed range', () => {
    const r = toReading({ readable: true, report_date: '31/10/2026', results: [{ ...good, collected_on: '2999-01-01', reference_low: 700, reference_high: 100 }] });
    expect(r.reportDate).toBeNull();
    expect(r.results[0]).toMatchObject({ collectedOn: null, referenceLow: null, referenceHigh: null });
  });

  it('leaves out a result printed as "<18", even when the model gave 18, and tells the doctor why', () => {
    const r = toReading({
      readable: true,
      results: [
        { ...good, printed_result: '340' },
        { ...good, kind: 'PSA', printed_result: '<0.1', value: 0.1, unit: 'ug/L' },
        { ...good, kind: 'LH', printed_result: '18,6', value: 18.6, unit: 'IU/L' },
        { ...good, kind: 'FSH', printed_result: '46.2', value: 64.2, unit: 'IU/L' },
      ],
      notes: 'All readable.',
    });
    expect(r.results.map((x) => [x.kind, x.value])).toEqual([['ESTRADIOL', 340], ['LH', 18.6]]);
    expect(r.notes).toBe('All readable. psa was left out: printed as “<0.1”, which is not an exact number. fsh was left out: printed as “46.2” but read as 64.2.');
  });

  it('keeps what was left out even when the model wrote long notes', () => {
    const r = toReading({ readable: true, results: [{ ...good, kind: 'PSA', printed_result: '<0.1', value: 0.1, unit: 'ug/L' }], notes: 'x'.repeat(1500) });
    expect(r.notes.length).toBeLessThanOrEqual(1000);
    expect(r.notes).toMatch(/psa was left out: printed as “<0\.1”/);
  });

  it('checks the printed result against the number read', () => {
    expect(printedMismatch('812', 812)).toBeNull();
    expect(printedMismatch(' 0,49 ', 0.49)).toBeNull();
    expect(printedMismatch(undefined, 5)).toBeNull();
    expect(printedMismatch('', 5)).toMatch(/no printed result/);
    expect(printedMismatch('   ', 5)).toMatch(/no printed result/);
    expect(printedMismatch('>100', 100)).toMatch(/not an exact number/);
    expect(printedMismatch('≤ 5', 5)).toMatch(/not an exact number/);
    expect(printedMismatch('see note', 5)).toMatch(/not a plain number/);
  });

  it('copes with nothing useful at all', () => {
    expect(toReading(null)).toEqual({ readable: false, patientName: null, labName: null, reportDate: null, results: [], notes: '' });
  });
});

describe('nameMatches', () => {
  it('matches the patient whatever the order or accents', () => {
    expect(nameMatches('KRASNIQI, Alma', 'Alma', 'Krasniqi')).toBe(true);
    expect(nameMatches('Ms Alma Çela Krasniqi', 'Alma', 'Çela')).toBe(true);
    expect(nameMatches('Dren Berisha', 'Alma', 'Krasniqi')).toBe(false);
    expect(nameMatches('Alma', 'Alma', 'Krasniqi')).toBe(false); // only part of the name is not enough
  });

  it('says so when the report shows no name', () => {
    expect(nameMatches(null, 'Alma', 'Krasniqi')).toBeNull();
  });
});

describe('LabReaderService without a key or with a file it cannot read', () => {
  const service = (env: Record<string, string> = {}) => new LabReaderService({ get: (k: string) => env[k] } as any);

  it('says reading is not set up, so the doctor types the results in', async () => {
    expect(await service().read(Buffer.from('x'), 'application/pdf')).toMatchObject({ status: 'NOT_CONFIGURED' });
  });

  it('does not read anything just because a key is set: the "labs" helper has to be switched on', async () => {
    expect(await service({ ANTHROPIC_API_KEY: 'k' }).read(Buffer.from('x'), 'application/pdf')).toMatchObject({ status: 'NOT_CONFIGURED' });
    expect(await service({ ANTHROPIC_API_KEY: 'k', AI_ENABLED_FEATURES: 'brief,reply' }).read(Buffer.from('x'), 'application/pdf')).toMatchObject({ status: 'NOT_CONFIGURED' });
    expect(await service({ ANTHROPIC_API_KEY: 'k', AI_ENABLED_FEATURES: 'labs', AI_DISABLED_FEATURES: 'labs' }).read(Buffer.from('x'), 'application/pdf')).toMatchObject({ status: 'NOT_CONFIGURED' });
  });

  it('refuses a type it cannot read, and an oversized file, before calling anything', async () => {
    const s = service({ ANTHROPIC_API_KEY: 'k', AI_ENABLED_FEATURES: 'labs' });
    expect(await s.read(Buffer.from('x'), 'image/heic')).toMatchObject({ status: 'UNSUPPORTED_FILE' });
    expect(await s.read(Buffer.alloc(16 * 1024 * 1024), 'application/pdf')).toMatchObject({ status: 'UNSUPPORTED_FILE' });
  });
});
