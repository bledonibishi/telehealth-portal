import { ConsultationKind } from '../common/enums';
import { findQuestionnaire, QuestionnaireStage } from './definitions';
import { evaluateAnswers } from './evaluate';

const STAGES: QuestionnaireStage[] = ['ELIGIBILITY', 'INTAKE', 'CHECKIN'];

describe('findQuestionnaire', () => {
  it('has an ELIGIBILITY, INTAKE and CHECKIN questionnaire for every kind, including TRT', () => {
    for (const kind of Object.values(ConsultationKind)) {
      for (const stage of STAGES) {
        expect(() => findQuestionnaire(kind, stage)).not.toThrow();
      }
    }
  });
});

describe('findQuestionnaire question IDs', () => {
  it('never asks the same question twice — no question ID appears in both ELIGIBILITY and INTAKE for a kind', () => {
    for (const kind of Object.values(ConsultationKind)) {
      const eligibilityIds = new Set(findQuestionnaire(kind, 'ELIGIBILITY').questions.map((q) => q.id));
      const intakeIds = findQuestionnaire(kind, 'INTAKE').questions.map((q) => q.id);
      const overlap = intakeIds.filter((id) => eligibilityIds.has(id));
      expect(overlap).toEqual([]);
    }
  });
});

describe('TRT questionnaires', () => {
  it('flags a history of prostate cancer as critical', () => {
    const intake = findQuestionnaire(ConsultationKind.TRT, 'INTAKE');
    const e = evaluateAnswers(intake, [{ questionId: 'prostate_cancer_history', answer: 'yes', value: 'yes' }], false);
    expect(e.flags).toContainEqual(expect.objectContaining({ severity: 'CRITICAL', description: expect.stringContaining('prostate cancer') }));
  });

  it('treats uncontrolled blood pressure as critical, same as HRT', () => {
    const intake = findQuestionnaire(ConsultationKind.TRT, 'INTAKE');
    const e = evaluateAnswers(
      intake,
      [
        { questionId: 'height_cm', answer: '180', value: '180' },
        { questionId: 'weight_kg', answer: '85', value: '85' },
        { questionId: 'bp_known', answer: 'yes', value: 'yes' },
        { questionId: 'bp_systolic', answer: '165', value: '165' },
        { questionId: 'bp_diastolic', answer: '95', value: '95' },
      ],
      false,
    );
    expect(e.flags).toContainEqual(expect.objectContaining({ severity: 'CRITICAL', description: expect.stringContaining('uncontrolled hypertension') }));
  });
});
