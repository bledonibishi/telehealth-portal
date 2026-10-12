import { readFileSync } from 'fs';
import { join } from 'path';
import { ConsultationKind } from '../common/enums';
import { QUESTIONNAIRES, findQuestionnaire } from './definitions';
import { SubmittedAnswer, evaluateAnswers } from './evaluate';

const GLP1_INTAKE = findQuestionnaire(ConsultationKind.GLP1, 'INTAKE');
const HRT_INTAKE = findQuestionnaire(ConsultationKind.HRT, 'INTAKE');

const common = (over: Record<string, string> = {}): SubmittedAnswer[] =>
  Object.entries({
    height_cm: '170',
    weight_kg: '95',
    bp_known: 'yes',
    bp_systolic: '125',
    bp_diastolic: '80',
    smoking: 'never',
    current_medications: 'None',
    allergies: 'None',
    ...over,
  }).map(([questionId, v]) => ({ questionId, answer: v, value: v }));

const glp1 = (over: Record<string, string> = {}) =>
  common({
    glp1_prior_use: 'no',
    diabetes_medicines: 'none',
    eating_disorder: 'no',
    gallbladder: 'no',
    kidney_disease: 'no',
    bariatric_surgery: 'no',
    ...over,
  });

const flagText = (e: { flags: { description: string; severity: string }[] }) => e.flags.map((f) => `${f.severity}:${f.description}`);

describe('evaluateAnswers', () => {
  it('accepts a complete GLP-1 intake and derives BMI from height and weight', () => {
    const e = evaluateAnswers(GLP1_INTAKE, glp1(), true);
    expect(e.errors).toEqual([]);
    expect(e.answers.find((a) => a.questionId === 'bmi_calculated')?.answer).toBe('32.9');
    expect(e.flags).toEqual([]);
  });

  it('rebuilds question and answer text from the definition, not the client', () => {
    const answers = glp1().map((a) => (a.questionId === 'smoking' ? { ...a, answer: 'tampered', value: 'current' } : a));
    const smoking = evaluateAnswers(GLP1_INTAKE, answers, true).answers.find((a) => a.questionId === 'smoking');
    expect(smoking).toMatchObject({ question: 'Do you smoke?', answer: 'Yes, currently', value: 'current' });
  });

  it('reports missing required answers in strict mode', () => {
    const e = evaluateAnswers(GLP1_INTAKE, glp1().filter((a) => a.questionId !== 'allergies'), true);
    expect(e.errors).toEqual([expect.stringContaining('allergies')]);
  });

  it('rejects numbers out of range', () => {
    const e = evaluateAnswers(GLP1_INTAKE, glp1({ height_cm: '17' }), true);
    expect(e.errors[0]).toMatch(/between 120 and 230 cm/);
  });

  it('asks follow-ups only when their condition is met', () => {
    const noBp = evaluateAnswers(GLP1_INTAKE, glp1({ bp_known: 'no' }), true);
    expect(noBp.errors).toEqual([]);
    expect(noBp.answers.some((a) => a.questionId === 'bp_systolic')).toBe(false);

    const prior = evaluateAnswers(GLP1_INTAKE, glp1({ glp1_prior_use: 'yes' }), true);
    expect(prior.errors).toEqual([
      expect.stringContaining('Which medicine'),
      expect.stringContaining('When did you last inject'),
      expect.stringContaining('How long have you been on that dose'),
    ]);

    const mounjaro = evaluateAnswers(
      GLP1_INTAKE,
      glp1({ glp1_prior_use: 'yes', glp1_prior_medicine: 'mounjaro', glp1_prior_dose_tirzepatide: '2.5 mg', glp1_last_dose: '1_2_weeks', glp1_weeks_on_dose: '4_plus_weeks' }),
      true,
    );
    expect(mounjaro.errors).toEqual([]);
    expect(mounjaro.answers.some((a) => a.questionId === 'glp1_prior_dose_semaglutide')).toBe(false);
  });

  it('rejects an exclusive option combined with others', () => {
    const e = evaluateAnswers(GLP1_INTAKE, glp1({ diabetes_medicines: 'insulin|none' }), true);
    expect(e.errors[0]).toMatch(/can’t be combined/);
  });

  it('raises flags from options and derived values', () => {
    const e = evaluateAnswers(GLP1_INTAKE, glp1({ weight_kg: '70', diabetes_medicines: 'insulin', diabetic_retinopathy: 'no', eating_disorder: 'yes' }), true);
    expect(flagText(e)).toEqual([
      'WARNING:On insulin — hypoglycaemia risk with GLP-1',
      'CRITICAL:History of eating disorder',
      'CRITICAL:Calculated BMI 24.2 is below 27',
    ]);
  });

  it('treats blood pressure over 160/100 as critical for HRT', () => {
    const hrt = common({
      bp_systolic: '165', bp_diastolic: '95',
      has_uterus: 'yes', last_period: 'within_12m', current_hrt: 'no', migraine_aura: 'no',
      liver_disease: 'no', family_vte: 'no', family_breast_cancer: 'no',
    });
    const e = evaluateAnswers(HRT_INTAKE, hrt, true);
    expect(e.errors).toEqual([]);
    expect(flagText(e)).toContain('CRITICAL:Blood pressure 165/95 — uncontrolled hypertension');
  });

  describe('Webflow eligibility answers (labels, comma-joined)', () => {
    const GLP1_ELIG = findQuestionnaire(ConsultationKind.GLP1, 'ELIGIBILITY');
    const HRT_ELIG = findQuestionnaire(ConsultationKind.HRT, 'ELIGIBILITY');

    it('matches labels, including curly apostrophes and multi-selects', () => {
      const e = evaluateAnswers(HRT_ELIG, [
        { questionId: 'age', answer: '40 to 54' },
        { questionId: 'symptoms', answer: 'Hot flushes or night sweats, Brain fog' },
        { questionId: 'medical_history', answer: 'None of the above' },
        { questionId: 'pregnancy', answer: 'No' },
        { questionId: 'blood_pressure', answer: 'No' },
      ], false);
      expect(e.flags).toEqual([]);
      expect(e.answers.find((a) => a.questionId === 'symptoms')?.value).toBe('vasomotor|brain_fog');
    });

    it('flags disqualifying answers that got past the client-side screen', () => {
      const e = evaluateAnswers(GLP1_ELIG, [
        { questionId: 'age', answer: '40 to 59' },
        { questionId: 'bmi', answer: '27 to 29.9' },
        { questionId: 'weight_conditions', answer: 'Neither of these' },
        { questionId: 'medical_history', answer: 'Pancreatitis' },
      ], false);
      expect(flagText(e)).toEqual([
        'CRITICAL:BMI 27–29.9 without a weight-related condition',
        'CRITICAL:History of pancreatitis',
      ]);
    });

    describe('the website’s calculated BMI ("BMI 34.2 (calculated from 168 cm, 92 kg)")', () => {
      const bmi = (answer: string, extra: SubmittedAnswer[] = []) =>
        evaluateAnswers(GLP1_ELIG, [{ questionId: 'age', answer: '40 to 59' }, { questionId: 'bmi', answer }, ...extra], false);

      it('is sorted into the same bands, so the server enforces the BMI rules itself', () => {
        expect(bmi('BMI 34.2 (calculated from 168 cm, 92 kg)').answers.find((a) => a.questionId === 'bmi')).toMatchObject({ answer: '30 or above', value: '30_plus' });
        expect(bmi('BMI 28.4 (calculated from 170 cm, 82 kg)').answers.find((a) => a.questionId === 'bmi')?.value).toBe('27_29');
        expect(bmi('BMI 30 (calculated from 170 cm, 86.7 kg)').answers.find((a) => a.questionId === 'bmi')?.value).toBe('30_plus');
      });

      it('flags a BMI under 27 that got past the browser', () => {
        expect(flagText(bmi('BMI 24.9 (calculated from 170 cm, 72 kg)'))).toEqual(['CRITICAL:Self-reported BMI under 27']);
      });

      it('asks for a weight-related condition between 27 and 29.9, and flags its absence', () => {
        const e = bmi('BMI 28.4 (calculated from 170 cm, 82 kg)', [{ questionId: 'weight_conditions', answer: 'Neither of these' }]);
        expect(flagText(e)).toEqual(['CRITICAL:BMI 27–29.9 without a weight-related condition']);
        expect(flagText(bmi('BMI 28.4 (calculated from 170 cm, 82 kg)', [{ questionId: 'weight_conditions', answer: 'High blood pressure' }]))).toEqual([]);
      });

      it('does not accept an impossible figure or other text as a BMI', () => {
        for (const answer of ['BMI 4 (calculated from 170 cm, 11 kg)', 'BMI 900 (calculated from 120 cm, 300 kg)', 'BMI abc', 'bmi is fine']) {
          expect(bmi(answer).answers.find((a) => a.questionId === 'bmi')).toMatchObject({ answer, value: null });
        }
      });
    });

    it('keeps unrecognised answers verbatim in lenient mode', () => {
      const e = evaluateAnswers(GLP1_ELIG, [{ questionId: 'bmi', answer: 'I don’t know' }, { questionId: 'age', answer: 'Something new' }], false);
      expect(e.errors).toEqual([]);
      expect(e.answers.find((a) => a.questionId === 'age')).toMatchObject({ answer: 'Something new', value: null });
    });

    it('uses exactly the option labels of the live Webflow quiz', () => {
      const embed = readFileSync(join(__dirname, '../../../website/webflow/live-site-scripts-embed.html'), 'utf8');
      const labels = [...embed.matchAll(/\{l:(?:'([^']*)'|NONE)/g)].map((m) => m[1] ?? 'None of the above');
      const ours = QUESTIONNAIRES.filter((q) => q.stage === 'ELIGIBILITY').flatMap((q) => q.questions.flatMap((x) => x.options!.map((o) => o.label)));
      for (const label of labels) expect(ours).toContain(label);
    });
  });
});
