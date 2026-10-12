import { LabReaderService, nameMatches, toReading } from './lab-reader.service';

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

  it('refuses a type it cannot read, and an oversized file, before calling anything', async () => {
    const s = service({ ANTHROPIC_API_KEY: 'k' });
    expect(await s.read(Buffer.from('x'), 'image/heic')).toMatchObject({ status: 'UNSUPPORTED_FILE' });
    expect(await s.read(Buffer.alloc(16 * 1024 * 1024), 'application/pdf')).toMatchObject({ status: 'UNSUPPORTED_FILE' });
  });
});
