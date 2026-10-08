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
    prescriptionProofUnavailable
    prescriptionProofReview {
      status
      reason
      riskLevel
      findings {
        severity
        message
      }
      documentIssues {
        code
        patientHint
      }
      failedAttempts
      nextStep
      nameEvidenceUrl
      nameEvidenceDocumentType
      nameEvidenceNames
      reportedMedicine
      reportedDoseLabel
      reportedLastDose
      reportedWeeksOnDose
      doseClarification
      requestedDoseLabel
      suggestedDoseLabel
      nameMatch
      patientNameOnDocument
      medicineName
      doseMg
      documentDate
      dateKind
      notes
      model
      reviewedAt
    }
    submittedAt
    reviewedAt
    bodyPhotoChecks {
      view
      outcome
      issues
    }
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
