import { OnboardingStepKey } from '../common/enums';

/**
 * The steps a clinician must decide before onboarding can be approved. When identity is checked in
 * verify-service the ID photos never reach this app, so that step is not part of the clinician's
 * review: the identity result gates approval instead.
 */
export function requiredReviewSteps(
  submission: { priorMedicationUse: boolean | null },
  identityViaVerifyService: boolean,
): OnboardingStepKey[] {
  const steps = identityViaVerifyService
    ? [OnboardingStepKey.BODY_PHOTO]
    : [OnboardingStepKey.ID_PHOTO, OnboardingStepKey.BODY_PHOTO];
  if (submission.priorMedicationUse) steps.push(OnboardingStepKey.PRESCRIPTION_PROOF);
  return steps;
}
