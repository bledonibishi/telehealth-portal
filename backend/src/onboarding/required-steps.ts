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

const STEP_LABEL: Record<string, string> = {
  [OnboardingStepKey.ID_PHOTO]: 'ID document and selfie',
  [OnboardingStepKey.BODY_PHOTO]: 'body photos',
  [OnboardingStepKey.PRESCRIPTION_PROOF]: 'proof of prescription',
};
export const stepLabel = (step: string) => STEP_LABEL[step] ?? 'step';

/**
 * What a step currently rests on, as a list of file ids (and the "no proof" choice). Kept when a clinician
 * asks for a step to be redone, so sending it in again can be checked against it: the same files again is
 * not a redo.
 */
export function stepFiles(
  s: {
    idDocumentFileId?: string | null;
    selfieFileId?: string | null;
    bodyPhotoFrontFileId?: string | null;
    bodyPhotoSideFileId?: string | null;
    prescriptionProofFileId?: string | null;
    prescriptionProofUnavailable?: boolean | null;
  },
  step: string,
): (string | null)[] {
  switch (step) {
    case OnboardingStepKey.ID_PHOTO:
      return [s.idDocumentFileId ?? null, s.selfieFileId ?? null];
    case OnboardingStepKey.BODY_PHOTO:
      return [s.bodyPhotoFrontFileId ?? null, s.bodyPhotoSideFileId ?? null];
    case OnboardingStepKey.PRESCRIPTION_PROOF:
      return [s.prescriptionProofFileId ?? null, s.prescriptionProofUnavailable ? 'unavailable' : null];
    default:
      return [];
  }
}

/** Steps a clinician sent back that still rest on exactly the files they sent back. */
export function unchangedRedoSteps(
  submission: Parameters<typeof stepFiles>[0] & { stepFeedback: unknown },
): string[] {
  const feedback = (submission.stepFeedback as { step: string; approved: boolean; files?: (string | null)[] }[] | null) ?? [];
  return feedback
    .filter((f) => !f.approved && Array.isArray(f.files))
    .filter((f) => {
      const now = stepFiles(submission, f.step);
      return f.files!.length === now.length && f.files!.every((id, i) => id === now[i]);
    })
    .map((f) => f.step);
}
