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
    bodyPhotosToRetake
    stepFeedback {
      step
      reason
    }
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

export const CHECK_BODY_PHOTO = gql`
  mutation CheckBodyPhoto($fileId: ID!, $view: BodyPhotoView!) {
    checkBodyPhoto(fileId: $fileId, view: $view) {
      outcome
      issues
      messages
      canSendForReview
    }
  }
`;

export const SAVE_BODY_PHOTO = gql`
  mutation SaveBodyPhoto($input: SaveBodyPhotoInput!) {
    saveBodyPhoto(input: $input) {
      ...OnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;

export const DISCARD_BODY_PHOTO = gql`
  mutation DiscardBodyPhoto($fileId: ID!) {
    discardBodyPhoto(fileId: $fileId)
  }
`;

export const CHECK_PHOTO_FRAME = gql`
  mutation CheckPhotoFrame($view: BodyPhotoView!, $image: String!) {
    checkPhotoFrame(view: $view, image: $image) {
      available
      ready
      messages
    }
  }
`;
