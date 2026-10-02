import { ConsultationKind, RiskTag } from '../common/enums';
import { findQuestionnaire } from './definitions';
import { triage, triageEligibility } from './triage';

const critical = (description: string) => ({ severity: 'CRITICAL', description });
const warning = (description: string) => ({ severity: 'WARNING', description });

describe('triage', () => {
  it('is GREEN without flags', () => {
    expect(triage([])).toEqual({ riskTag: RiskTag.GREEN, reasons: [] });
  });

  it('is ORANGE for warnings only, listing them', () => {
    expect(triage([warning('Current smoker'), warning('Current smoker'), warning('Sleep apnea')])).toEqual({
      riskTag: RiskTag.ORANGE,
      reasons: ['Current smoker', 'Sleep apnea'],
    });
  });

  it('is RED when any flag is critical, and lists only the critical ones', () => {
    expect(triage([warning('Current smoker'), critical('Currently pregnant')])).toEqual({
      riskTag: RiskTag.RED,
      reasons: ['Currently pregnant'],
    });
  });
});

// Real eligibility answers, as the website sends them (option labels).
const ans = (kind: ConsultationKind, picks: Record<string, string>) => {
  const q = findQuestionnaire(kind, 'ELIGIBILITY');
  return Object.entries(picks).map(([questionId, answer]) => ({ questionId, question: q.questions.find((x) => x.id === questionId)!.text, answer }));
};

describe('triageEligibility', () => {
  it('blocks a GLP-1 applicant with a history of pancreatitis (RED)', () => {
    const q = findQuestionnaire(ConsultationKind.GLP1, 'ELIGIBILITY');
    const age = q.questions.find((x) => x.id === 'age')!.options!.find((o) => !o.flag)!.label;
    const history = q.questions.find((x) => x.id === 'medical_history')?.options?.find((o) => o.value === 'pancreatitis');
    expect(history).toBeDefined();
    const result = triageEligibility(ConsultationKind.GLP1, ans(ConsultationKind.GLP1, { age, medical_history: history!.label }));
    expect(result.riskTag).toBe(RiskTag.RED);
    expect(result.reasons).toContain('History of pancreatitis');
  });

  it('is GREEN when nothing is flagged', () => {
    const q = findQuestionnaire(ConsultationKind.HRT, 'ELIGIBILITY');
    const age = q.questions.find((x) => x.id === 'age')!.options!.find((o) => o.value === '40_54')!.label;
    expect(triageEligibility(ConsultationKind.HRT, ans(ConsultationKind.HRT, { age })).riskTag).toBe(RiskTag.GREEN);
  });

  it('is ORANGE for a warning such as being under 40 on HRT', () => {
    const q = findQuestionnaire(ConsultationKind.HRT, 'ELIGIBILITY');
    const age = q.questions.find((x) => x.id === 'age')!.options!.find((o) => o.value === '18_39')!.label;
    expect(triageEligibility(ConsultationKind.HRT, ans(ConsultationKind.HRT, { age })).riskTag).toBe(RiskTag.ORANGE);
  });
});
