import { assessPriorDose, AssessmentInput, DocumentReading, matchName, RequestedDose, stepForDose } from './prior-dose-assessment';

const MOUNJARO_LADDER = ['2.5 mg', '5 mg', '7.5 mg', '10 mg', '12.5 mg', '15 mg'].map((label, i) => ({ label, step: i + 1 }));
const WEGOVY_LADDER = ['0.25 mg', '0.5 mg', '1 mg', '1.7 mg', '2.4 mg'].map((label, i) => ({ label, step: i + 1 }));

const mounjaro = (label: string): RequestedDose => ({
  productName: 'Mounjaro',
  molecule: 'tirzepatide',
  label,
  step: MOUNJARO_LADDER.find((s) => s.label === label)!.step,
  ladder: MOUNJARO_LADDER,
});

const TODAY = new Date('2026-10-06T12:00:00Z');

const doc = (overrides: Partial<DocumentReading> = {}): DocumentReading => ({
  readable: true,
  isPrescriptionEvidence: true,
  patientName: 'Ann Lee',
  medicineName: 'Mounjaro KwikPen',
  molecule: 'tirzepatide',
  doseMg: 2.5,
  documentDate: '2026-09-20',
  dateKind: 'dispensed',
  authenticityConcerns: [],
  notes: '',
  ...overrides,
});

const input = (overrides: Partial<AssessmentInput> = {}): AssessmentInput => ({
  patient: { firstName: 'Ann', lastName: 'Lee' },
  requested: mounjaro('5 mg'),
  reported: { medicine: 'mounjaro', doseLabel: '2.5 mg', lastDose: 'under_1_week', weeksOnDose: '4_plus_weeks' },
  document: doc(),
  today: TODAY,
  ...overrides,
});

describe('assessPriorDose', () => {
  it('is OK for one step up after 4+ weeks on the dose, injected recently', () => {
    const a = assessPriorDose(input());
    expect(a.riskLevel).toBe('OK');
    expect(a.verifiedStep).toBe(1);
    expect(a.safeMaxStep).toBe(2);
    expect(a.patientMessage).toMatch(/fits the dose you’ve chosen/);
  });

  it('flags 2.5 mg → 7.5 mg as a caution and 2.5 mg → 10 mg as high risk', () => {
    const caution = assessPriorDose(input({ requested: mounjaro('7.5 mg') }));
    expect(caution.riskLevel).toBe('CAUTION');
    expect(caution.suggestedDoseLabel).toBe('5 mg');

    const high = assessPriorDose(input({ requested: mounjaro('10 mg') }));
    expect(high.riskLevel).toBe('HIGH');
    expect(high.suggestedDoseLabel).toBe('5 mg');
    expect(high.patientMessage).toMatch(/Your document shows Mounjaro KwikPen 2\.5 mg\. You chose 10 mg, but going from 2\.5 mg to 10 mg skips several steps/);
    expect(high.patientMessage).toMatch(/most likely start you on 5 mg/);
    expect(high.findings.some((f) => f.severity === 'CRITICAL' && /2 step\(s\) above/.test(f.message))).toBe(true);
  });

  it('does not allow a step up before 4 weeks on the current dose', () => {
    const a = assessPriorDose(input({ reported: { medicine: 'mounjaro', doseLabel: '2.5 mg', lastDose: 'under_1_week', weeksOnDose: 'under_4_weeks' } }));
    expect(a.riskLevel).toBe('CAUTION');
    expect(a.safeMaxStep).toBe(1);
    expect(a.patientMessage).toMatch(/less than 4 weeks/);
  });

  it.each([
    ['2_4_weeks', '7.5 mg', 'same dose', 3],
    ['4_8_weeks', '7.5 mg', 'a step lower', 2],
    ['over_8_weeks', '7.5 mg', 'starting dose', 1],
  ] as const)('after a gap of %s on %s, restarts at %s', (lastDose, label, _desc, expectedMax) => {
    const a = assessPriorDose(
      input({
        requested: mounjaro(label),
        reported: { medicine: 'mounjaro', doseLabel: '7.5 mg', lastDose, weeksOnDose: '4_plus_weeks' },
        document: doc({ doseMg: 7.5 }),
      }),
    );
    expect(a.safeMaxStep).toBe(expectedMax);
  });

  it('a long gap explains the restart to the patient', () => {
    const a = assessPriorDose(
      input({
        requested: mounjaro('7.5 mg'),
        reported: { medicine: 'mounjaro', doseLabel: '7.5 mg', lastDose: 'over_8_weeks', weeksOnDose: '4_plus_weeks' },
        document: doc({ doseMg: 7.5, documentDate: '2026-07-01' }),
      }),
    );
    expect(a.riskLevel).toBe('HIGH');
    expect(a.suggestedDoseLabel).toBe('2.5 mg');
    expect(a.patientMessage).toMatch(/more than 8 weeks since your last injection/);
  });

  it('trusts the document dose over the patient’s answer, and flags the difference', () => {
    const a = assessPriorDose(
      input({
        requested: mounjaro('10 mg'),
        reported: { medicine: 'mounjaro', doseLabel: '7.5 mg', lastDose: 'under_1_week', weeksOnDose: '4_plus_weeks' },
        document: doc({ doseMg: 2.5 }),
      }),
    );
    expect(a.verifiedStep).toBe(1);
    expect(a.riskLevel).toBe('HIGH');
    expect(a.findings.map((f) => f.message)).toContain('Document shows 2.5 mg, but the patient said 7.5 mg');
  });

  it('treats a document in someone else’s name as unverified evidence', () => {
    const a = assessPriorDose(input({ document: doc({ patientName: 'John Smith' }) }));
    expect(a.riskLevel).toBe('HIGH');
    expect(a.nameMatch).toBe('MISMATCH');
    expect(a.verifiedStep).toBeNull();
    expect(a.documentIssues[0].patientHint).toBe('Expected: Ann Lee');
  });

  it('flags old, future-dated and undated documents', () => {
    expect(assessPriorDose(input({ document: doc({ documentDate: '2026-03-01' }) })).findings.map((f) => f.message).join()).toMatch(/days old/);
    expect(assessPriorDose(input({ document: doc({ documentDate: '2027-01-01' }) })).riskLevel).toBe('HIGH');
    expect(assessPriorDose(input({ document: doc({ documentDate: null }) })).riskLevel).toBe('CAUTION');
  });

  it('is unverified when the document could not be read, but still checks the reported dose', () => {
    const a = assessPriorDose(input({ document: null, requested: mounjaro('10 mg') }));
    expect(a.riskLevel).toBe('HIGH');
    expect(a.patientMessage).toMatch(/You told us you were on Mounjaro 2\.5 mg/);

    const ok = assessPriorDose(input({ document: null }));
    expect(ok.riskLevel).toBe('UNVERIFIED');
  });

  it('flags a switch between medicines for the clinician', () => {
    const a = assessPriorDose(
      input({
        reported: { medicine: 'wegovy', doseLabel: '1 mg', lastDose: 'under_1_week', weeksOnDose: '4_plus_weeks' },
        document: doc({ molecule: 'semaglutide', medicineName: 'Wegovy', doseMg: 1 }),
      }),
    );
    expect(a.riskLevel).toBe('CAUTION');
    expect(a.findings.map((f) => f.message).join()).toMatch(/Switching from semaglutide/);
  });
});

describe('document issues', () => {
  const codes = (i: Partial<AssessmentInput>) => assessPriorDose(input(i)).documentIssues.map((d) => d.code);

  it('has none for a clean document, even when the dose itself is risky', () => {
    expect(codes({})).toEqual([]);
    expect(codes({ requested: mounjaro('10 mg') })).toEqual([]);
  });

  it('lists each fixable problem with advice for the patient', () => {
    expect(codes({ document: doc({ patientName: 'John Smith' }) })).toEqual(['NAME_MISMATCH']);
    expect(codes({ document: doc({ patientName: null, doseMg: null, documentDate: null }) })).toEqual(['NAME_MISSING', 'DOSE_MISSING', 'DATE_MISSING']);
    expect(codes({ document: doc({ doseMg: 5 }) })).toEqual(['DOSE_MISMATCH']);
    expect(codes({ document: doc({ readable: false }) })).toEqual(['UNREADABLE']);

    const [hint] = assessPriorDose(input({ document: doc({ patientName: 'Ann Smith' }) })).documentIssues;
    expect(hint.patientHint).toBe('Expected: Ann Lee');
  });

  it('keeps suspected editing for the clinician, not the patient', () => {
    const a = assessPriorDose(input({ document: doc({ authenticityConcerns: ['dose digits in a different font'] }) }));
    expect(a.documentIssues).toEqual([]);
    expect(a.riskLevel).toBe('CAUTION');
  });
});

describe('the patient’s answers, for the clinician', () => {
  it('are passed through in the questionnaire’s wording', () => {
    const a = assessPriorDose(input({ reported: { medicine: 'mounjaro', doseLabel: '2.5 mg', lastDose: '2_4_weeks', weeksOnDose: 'under_4_weeks' } }));
    expect(a).toMatchObject({
      reportedMedicineLabel: 'Mounjaro',
      reportedDoseLabel: '2.5 mg',
      reportedLastDoseLabel: '2 to 4 weeks ago',
      reportedWeeksOnDoseLabel: 'Less than 4 weeks',
    });
  });
});

describe('checklist', () => {
  const statuses = (i: Partial<AssessmentInput>) => Object.fromEntries(assessPriorDose(input(i)).checks.map((c) => [c.key, c.status]));

  it('passes every line for a matching document, showing what was read', () => {
    const a = assessPriorDose(input());
    expect(a.checks).toEqual([
      { key: 'NAME', status: 'PASS', value: 'Ann Lee', hint: null },
      { key: 'MEDICINE', status: 'PASS', value: 'Mounjaro KwikPen', hint: null },
      { key: 'DOSE', status: 'PASS', value: '2.5 mg', hint: null },
      { key: 'DATE', status: 'PASS', value: 'Dispensed 2026-09-20', hint: null },
    ]);
  });

  it('fails only the lines that don’t match, with the advice on the line', () => {
    expect(statuses({ document: doc({ patientName: 'Karen Lincoln', documentDate: '2025-01-10' }) })).toEqual({ NAME: 'FAIL', MEDICINE: 'PASS', DOSE: 'PASS', DATE: 'FAIL' });
    const name = assessPriorDose(input({ document: doc({ patientName: 'Karen Lincoln' }) })).checks[0];
    expect(name.hint).toBe('Expected: Ann Lee');
  });

  it('does not compare doses of different medicines', () => {
    const a = assessPriorDose(
      input({
        reported: { medicine: 'mounjaro', doseLabel: '2.5 mg', lastDose: 'under_1_week', weeksOnDose: '4_plus_weeks' },
        document: doc({ molecule: 'semaglutide', medicineName: 'Wegovy', doseMg: 1.5 }),
      }),
    );
    expect(Object.fromEntries(a.checks.map((c) => [c.key, c.status]))).toMatchObject({ MEDICINE: 'FAIL', DOSE: 'REVIEW' });
    expect(a.documentIssues.map((i) => i.code)).toEqual(['MEDICINE_MISMATCH']);
  });

  it('has no lines when the document could not be read', () => {
    expect(assessPriorDose(input({ document: doc({ readable: false }) })).checks).toEqual([]);
  });
});

describe('dose mismatch question', () => {
  // Document 2.5 mg; the patient said 5 mg and asked for 7.5 mg.
  const mismatch = (doseClarification?: AssessmentInput['doseClarification']) =>
    assessPriorDose(
      input({
        requested: mounjaro('7.5 mg'),
        reported: { medicine: 'mounjaro', doseLabel: '5 mg', lastDose: 'under_1_week', weeksOnDose: '4_plus_weeks' },
        doseClarification,
      }),
    );
  const dose = (a: ReturnType<typeof mismatch>) => a.checks.find((c) => c.key === 'DOSE')!;

  it('asks the patient when unanswered', () => {
    const a = mismatch();
    expect(dose(a).status).toBe('FAIL');
    expect(a.documentIssues.map((i) => i.code)).toEqual(['DOSE_MISMATCH']);
    expect(a.reportedDoseLabel).toBe('5 mg');
  });

  it('“the document is right” resolves it', () => {
    const a = mismatch('DOCUMENT_CORRECT');
    expect(dose(a).status).toBe('PASS');
    expect(a.documentIssues).toEqual([]);
    expect(a.findings.map((f) => f.message)).toContain('Patient confirmed the document’s dose (2.5 mg); the questionnaire said 5 mg');
  });

  it('“moved up since” asks for newer proof and keeps the safer documented dose', () => {
    const a = mismatch('STEPPED_UP_SINCE');
    expect(a.documentIssues.map((i) => i.code)).toEqual(['DOSE_NEWER_PROOF']);
    expect(a.verifiedStep).toBe(1); // 2.5 mg, not the self-reported 5 mg
    expect(a.suggestedDoseLabel).toBe('5 mg');
    expect(a.riskLevel).toBe('CAUTION');
  });

  it('“not sure” needs nothing more from the patient, but flags the clinician', () => {
    const a = mismatch('NOT_SURE');
    expect(dose(a).status).toBe('REVIEW');
    expect(a.documentIssues).toEqual([]);
    expect(a.findings.some((f) => f.severity === 'WARNING' && /isn’t sure/.test(f.message))).toBe(true);
  });
});

describe('dose went down since the document', () => {
  // Document 5 mg; the patient said 2.5 mg (lower) and asked for 5 mg.
  const down = (doseClarification?: AssessmentInput['doseClarification']) =>
    assessPriorDose(
      input({
        requested: mounjaro('5 mg'),
        reported: { medicine: 'mounjaro', doseLabel: '2.5 mg', lastDose: 'under_1_week', weeksOnDose: '4_plus_weeks' },
        document: doc({ doseMg: 5 }),
        doseClarification,
      }),
    );

  it('goes by the lower dose until the patient confirms the document', () => {
    expect(down().safeMaxStep).toBe(2); // from 2.5 mg: one step up
    expect(down('NOT_SURE').safeMaxStep).toBe(2);
    expect(down('DOCUMENT_CORRECT').safeMaxStep).toBe(3); // from 5 mg
  });

  it('“went down since” needs no more proof, and tells the clinician to ask why', () => {
    const a = down('STEPPED_DOWN_SINCE');
    expect(a.documentIssues).toEqual([]);
    expect(a.checks.find((c) => c.key === 'DOSE')).toMatchObject({ status: 'REVIEW' });
    expect(a.verifiedStep).toBeNull();
    expect(a.findings.map((f) => f.message).join()).toMatch(/went down to 2\.5 mg.*ask why/);
  });
});

describe('name-change evidence', () => {
  const maiden = { document: doc({ patientName: 'Ann Smith' }) };

  it('accepts a proof in a previous name when the evidence shows both names', () => {
    const a = assessPriorDose(input({ ...maiden, nameEvidence: { readable: true, documentType: 'Marriage certificate', names: ['Ann Smith', 'Ann Lee'] } }));
    expect(a.nameMatch).toBe('MATCH_VIA_EVIDENCE');
    expect(a.documentIssues).toEqual([]);
    expect(a.verifiedStep).toBe(1);
    expect(a.riskLevel).toBe('OK');
  });

  it('still mismatches when the evidence does not link the names', () => {
    const a = assessPriorDose(input({ ...maiden, nameEvidence: { readable: true, documentType: 'Deed poll', names: ['Ann Smith', 'Ann Jones'] } }));
    expect(a.nameMatch).toBe('MISMATCH');
    expect(a.documentIssues[0].patientHint).toBe('Expected: Ann Lee');
  });
});

describe('matchName', () => {
  const patient = { firstName: 'Ann-Marie', lastName: 'Lée' };
  it('matches regardless of case, accents and order', () => {
    expect(matchName('LEE, ANN MARIE', patient)).toBe('MATCH');
  });
  it('is partial on surname plus initial', () => {
    expect(matchName('A. Lee', patient)).toBe('PARTIAL');
  });
  it('mismatches a different person', () => {
    expect(matchName('John Smith', patient)).toBe('MISMATCH');
    // Same surname, someone else's first name: another person's document, not a partial match.
    expect(matchName('John Lee', patient)).toBe('MISMATCH');
    expect(matchName('Mrs Lee', patient)).toBe('PARTIAL');
    expect(matchName('Ann Lee', patient)).toBe('PARTIAL'); // part of her own first name
    expect(matchName('A. M. Lee', patient)).toBe('PARTIAL');
    expect(matchName(null, patient)).toBe('NOT_FOUND');
  });
});

describe('stepForDose', () => {
  it('maps an off-ladder dose (Ozempic 2 mg) to the highest strength below it', () => {
    expect(stepForDose(WEGOVY_LADDER, 2)).toBe(4);
    expect(stepForDose(WEGOVY_LADDER, 1)).toBe(3);
  });
});
