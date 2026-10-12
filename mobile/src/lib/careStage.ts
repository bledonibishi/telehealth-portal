/** Where the patient is on the way to being treated: the same reading the web portal gives, so both say the same thing. */
export type CareStage = 'NO_CONSULTATION' | 'MORE_INFO' | 'IN_REVIEW' | 'DECLINED' | 'TREATING';

export interface NextStep {
  stage: CareStage;
  title: string;
  text: string;
  /** The one thing to do now, when there is one: a tab to open. */
  action?: { tab: 'New Consultation' | 'Messages' | 'Status'; label: string };
}

export function careStage(consultations: { status: string }[], plan: unknown): NextStep {
  if (plan) return { stage: 'TREATING', title: 'Your treatment is under way', text: 'Your plan is below.' };
  if (consultations.length === 0) {
    return { stage: 'NO_CONSULTATION', title: 'First, your medical questionnaire', text: 'A doctor reviews your answers before prescribing. It takes a few minutes.', action: { tab: 'New Consultation', label: 'Start the questionnaire' } };
  }
  if (consultations.some((c) => c.status === 'MORE_INFO_REQUESTED')) {
    return { stage: 'MORE_INFO', title: 'Your doctor needs a little more information', text: 'Read their message, then update your answers so they can decide.', action: { tab: 'Messages', label: 'Read the message' } };
  }
  if (consultations.some((c) => c.status === 'SUBMITTED' || c.status === 'IN_REVIEW' || c.status === 'APPROVED')) {
    return { stage: 'IN_REVIEW', title: 'A doctor is reviewing your answers', text: 'You don’t need to do anything. This screen fills in by itself as soon as your prescription is confirmed.' };
  }
  return { stage: 'DECLINED', title: 'Your doctor decided not to prescribe', text: 'Their message explains why and what you can do next.', action: { tab: 'Messages', label: 'Read the message' } };
}
