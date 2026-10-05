import { gql } from '@apollo/client';

export const ONBOARDING_FIELDS = gql`
  fragment ClinicianOnboardingFields on OnboardingSubmission {
    id
    status
    personaStatus
    identityViaVerifyService
    photoReviewStatus
    priorMedicationUse
    prescriptionProofType
    idDocumentUrl
    selfieUrl
    bodyPhotoFrontUrl
    bodyPhotoSideUrl
    prescriptionProofUrl
    submittedAt
    reviewedAt
    stepFeedback {
      step
      approved
      reason
    }
  }
`;

export const GET_ONBOARDING_SUBMISSION = gql`
  query GetOnboardingSubmission($patientId: ID!) {
    onboardingSubmission(patientId: $patientId) {
      ...ClinicianOnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;

export const REVIEW_ONBOARDING_STEP = gql`
  mutation ReviewOnboardingStep($input: ReviewOnboardingStepInput!) {
    reviewOnboardingStep(input: $input) {
      ...ClinicianOnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;
