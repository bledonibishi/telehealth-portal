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
    prescriptionProofUnavailable
    proofRequirements {
      name
      medicine
      dose
      notBefore
    }
    prescriptionProofReview {
      status
      riskLevel
      patientMessage
      requestedDoseLabel
      suggestedDoseLabel
      documentIssues {
        code
        patientHint
      }
      checks {
        key
        status
        value
        hint
      }
      doseMg
      reportedDoseLabel
      doseClarification
      failedAttempts
      nextStep
    }
    submittedAt
    reviewedAt
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

export const SAVE_PRESCRIPTION_NAME_EVIDENCE = gql`
  mutation SavePrescriptionNameEvidence($fileId: ID!) {
    savePrescriptionNameEvidence(fileId: $fileId) {
      ...OnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;

export const CLARIFY_PRESCRIPTION_DOSE = gql`
  mutation ClarifyPrescriptionDose($choice: String!) {
    clarifyPrescriptionDose(choice: $choice) {
      ...OnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;

export const DECLARE_PRESCRIPTION_PROOF_UNAVAILABLE = gql`
  mutation DeclarePrescriptionProofUnavailable {
    declarePrescriptionProofUnavailable {
      ...OnboardingFields
    }
  }
  ${ONBOARDING_FIELDS}
`;
