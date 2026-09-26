import { gql } from '@apollo/client';

export const ONBOARDING_FIELDS = gql`
  fragment OnboardingFields on OnboardingSubmission {
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

export const MY_ONBOARDING = gql`
  query MyOnboarding {
    myOnboarding {
      ...OnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;

export const SAVE_IDENTITY_STEP = gql`
  mutation SaveIdentityStep($input: SaveIdentityStepInput!) {
    saveIdentityStep(input: $input) {
      ...OnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;

export const SAVE_BODY_PHOTOS_STEP = gql`
  mutation SaveBodyPhotosStep($input: SaveBodyPhotosStepInput!) {
    saveBodyPhotosStep(input: $input) {
      ...OnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;

export const SAVE_PRIOR_MEDICATION_USE = gql`
  mutation SavePriorMedicationUse($priorMedicationUse: Boolean!) {
    savePriorMedicationUse(priorMedicationUse: $priorMedicationUse) {
      ...OnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;

export const SAVE_PRESCRIPTION_PROOF_STEP = gql`
  mutation SavePrescriptionProofStep($input: SavePrescriptionProofStepInput!) {
    savePrescriptionProofStep(input: $input) {
      ...OnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;

export const SUBMIT_ONBOARDING = gql`
  mutation SubmitOnboarding {
    submitOnboarding {
      ...OnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;
