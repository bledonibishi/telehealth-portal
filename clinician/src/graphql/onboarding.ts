import { gql } from '@apollo/client';

export const ONBOARDING_FIELDS = gql`
  fragment ClinicianOnboardingFields on OnboardingSubmission {
    id
    status
    personaStatus
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
    rejectionReason
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

export const REVIEW_ONBOARDING = gql`
  mutation ReviewOnboarding($input: ReviewOnboardingInput!) {
    reviewOnboarding(input: $input) {
      ...ClinicianOnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;
