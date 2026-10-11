import type { DocumentReading } from './prior-dose-assessment';
import { type ExpectedReading, normaliseName, scoreReading, summarise } from './proof-reader-scoring';

const expected: ExpectedReading = { readable: true, isPrescriptionEvidence: true, patientName: 'Zoë Müller', molecule: 'tirzepatide', doseMg: 5, documentDate: '2026-09-03', dateKind: 'dispensed', flagsConcerns: false };
const read = (over: Partial<DocumentReading> = {}): DocumentReading => ({
  readable: true, isPrescriptionEvidence: true, patientName: 'ZOE MULLER', medicineName: 'Mounjaro', molecule: 'tirzepatide', doseMg: 5, documentDate: '2026-09-03', dateKind: 'dispensed', authenticityConcerns: [], notes: '', ...over,
});

describe('scoreReading', () => {
  it('counts a right reading as right, ignoring case and accents in names', () => {
    expect(Object.values(scoreReading(expected, read()))).toEqual(Array(8).fill('correct'));
    expect(normaliseName("  Sean  O'Connor ")).toBe('sean o connor');
  });

  it('calls a different value wrong, and nothing read abstained', () => {
    const s = scoreReading(expected, read({ doseMg: 2.5, documentDate: null, patientName: 'Zoe Miller' }));
    expect(s).toMatchObject({ doseMg: 'wrong', documentDate: 'abstained', patientName: 'wrong' });
  });

  it('calls a value invented where the document has none wrong, but not reading it correct', () => {
    const blank: ExpectedReading = { ...expected, readable: false, isPrescriptionEvidence: false, patientName: null, molecule: 'not_found', doseMg: null, documentDate: null, dateKind: 'not_found' };
    expect(scoreReading(blank, read({ readable: false, isPrescriptionEvidence: false, patientName: null, molecule: 'not_found', doseMg: null, documentDate: null, dateKind: 'not_found' }))).toMatchObject({ doseMg: 'correct', patientName: 'correct', molecule: 'correct' });
    expect(scoreReading(blank, read({ doseMg: 7.5 })).doseMg).toBe('wrong');
  });

  it('treats a tampered document passed as clean as wrong, and a false alarm as only abstained', () => {
    expect(scoreReading({ ...expected, flagsConcerns: true }, read()).flagsConcerns).toBe('wrong');
    expect(scoreReading(expected, read({ authenticityConcerns: ['odd font'] })).flagsConcerns).toBe('abstained');
    expect(scoreReading({ ...expected, flagsConcerns: true }, read({ authenticityConcerns: ['odd font'] })).flagsConcerns).toBe('correct');
  });

  it('does not score fields marked as skipped, and sends everything to a clinician when the read failed', () => {
    expect(scoreReading({ ...expected, readable: null }, read({ readable: false })).readable).toBe('skipped');
    const failed = scoreReading(expected, null);
    expect(Object.values(failed)).toEqual(Array(8).fill('abstained'));
  });
});

describe('summarise', () => {
  it('counts documents with a confident error, and those with a wrong dose or date', () => {
    const s = summarise([scoreReading(expected, read()), scoreReading(expected, read({ doseMg: 10 })), scoreReading(expected, read({ patientName: 'Someone Else' })), scoreReading(expected, null)]);
    expect(s).toMatchObject({ documents: 4, documentsWithAnError: 2, documentsWithWrongDoseOrDate: 1 });
    expect(s.fields.doseMg).toEqual({ correct: 2, abstained: 1, wrong: 1 });
  });
});
