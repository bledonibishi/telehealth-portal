import { ConsultationKind, RedFlagSeverity, RiskTag } from '../common/enums';
import { findQuestionnaire } from './definitions';
import { evaluateAnswers, SubmittedAnswer } from './evaluate';

export interface TriageResult {
  riskTag: RiskTag;
  /** The flags that decided the tag: the disqualifying ones for RED, the ones needing a closer look for ORANGE. */
  reasons: string[];
}

/**
 * Turns the flags raised by a patient's answers into a risk tag. The questionnaires decide what is
 * disqualifying (CRITICAL) or needs the doctor's attention (WARNING); this only reads the result.
 *   RED     any critical flag (e.g. pregnancy, pancreatitis) — not treatable online
 *   ORANGE  warnings only — a doctor reviews these closely
 *   GREEN   no flags — standard approval
 */
export function triage(flags: Array<{ severity: string; description: string }>): TriageResult {
  const reasonsOf = (severity: RedFlagSeverity) => [...new Set(flags.filter((f) => f.severity === severity).map((f) => f.description))];
  const critical = reasonsOf(RedFlagSeverity.CRITICAL);
  if (critical.length) return { riskTag: RiskTag.RED, reasons: critical };
  const warnings = reasonsOf(RedFlagSeverity.WARNING);
  if (warnings.length) return { riskTag: RiskTag.ORANGE, reasons: warnings };
  return { riskTag: RiskTag.GREEN, reasons: [] };
}

/** Triage of the eligibility quiz a visitor answered on the website, before they can see plans or pay. */
export function triageEligibility(kind: ConsultationKind, answers: SubmittedAnswer[]): TriageResult {
  const evaluation = evaluateAnswers(findQuestionnaire(kind, 'ELIGIBILITY'), Array.isArray(answers) ? answers : [], false);
  return triage(evaluation.flags);
}
