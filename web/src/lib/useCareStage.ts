'use client';

import { useQuery } from '@apollo/client';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { MY_TREATMENT_PLAN } from '@/graphql/portal';

/** Where the patient is on the way to being treated. Every "nothing here yet" screen is explained by one of these. */
export type CareStage =
  | 'LOADING'
  | 'NO_CONSULTATION' //  hasn't sent the medical questionnaire
  | 'MORE_INFO' //        the doctor asked for more before deciding
  | 'IN_REVIEW' //        sent; a doctor is looking at it
  | 'DECLINED' //         the doctor decided not to prescribe
  | 'TREATING'; //        has an active prescription

export interface NextStep {
  stage: CareStage;
  /** What is going on, in a sentence. */
  title: string;
  /** What happens next, or what the patient should do. */
  text: string;
  /** The one thing to do now, when there is one. */
  action?: { href: string; label: string };
}

const QUESTIONNAIRE = '/onboarding/medical-questionnaire?from=dashboard';

/**
 * One reading of the patient's situation, shared by every page: a page that has nothing to show asks this
 * why, and tells the patient the same thing every other page would. Uses queries the dashboard already made.
 */
export function useCareStage(): NextStep {
  const { data: cData, loading: cLoading } = useQuery(MY_CONSULTATIONS, { fetchPolicy: 'cache-first' });
  const { data: pData, loading: pLoading } = useQuery(MY_TREATMENT_PLAN, { fetchPolicy: 'cache-first' });
  const consultations: any[] = cData?.myConsultations ?? [];

  if (pData?.myTreatmentPlan) return { stage: 'TREATING', title: 'Your treatment is under way', text: 'Everything about it is under My Treatment.', action: { href: '/treatment-plan', label: 'Open My Treatment' } };
  if ((cLoading && !cData) || (pLoading && !pData)) return { stage: 'LOADING', title: 'Loading…', text: '' };

  if (consultations.length === 0) {
    return { stage: 'NO_CONSULTATION', title: 'First, your medical questionnaire', text: 'A doctor reviews your answers before prescribing. It takes a few minutes.', action: { href: QUESTIONNAIRE, label: 'Start the questionnaire' } };
  }
  if (consultations.some((c) => c.status === 'MORE_INFO_REQUESTED')) {
    return { stage: 'MORE_INFO', title: 'Your doctor needs a little more information', text: 'Read their message, then update your answers so they can decide.', action: { href: '/messages', label: 'Read the message' } };
  }
  if (consultations.some((c) => c.status === 'SUBMITTED' || c.status === 'IN_REVIEW' || c.status === 'APPROVED')) {
    const latest = consultations[0];
    return { stage: 'IN_REVIEW', title: 'A doctor is reviewing your answers', text: 'You don’t need to do anything. We’ll email you as soon as your prescription is confirmed, and this page fills in by itself.', action: latest ? { href: `/consultation/${latest.id}`, label: 'See your consultation' } : undefined };
  }
  return { stage: 'DECLINED', title: 'Your doctor decided not to prescribe', text: 'Their message explains why and what you can do next.', action: { href: '/messages', label: 'Read the message' } };
}
