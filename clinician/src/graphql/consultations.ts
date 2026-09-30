import { gql } from '@apollo/client';

export const PRESCRIPTION_FRAGMENT = gql`
  fragment PrescriptionFields on Prescription {
    id
    status
    medication
    dosage
    instructions
    issuedAt
    validUntil
    refillsAllowed
    overrideReason
    contentHash
    documentUrl
    prescriber {
      id
      firstName
      lastName
    }
    items {
      id
      quantity
      directions
      product {
        id
        name
        brandName
        kind
        requiresColdChain
      }
      strength {
        id
        label
        packDescription
        titrationStep
      }
    }
    repeatsRemaining
    cancelReason
  }
`;

const CONSULTATION_FRAGMENT = gql`
  ${PRESCRIPTION_FRAGMENT}
  fragment ConsultationFields on Consultation {
    id
    kind
    status
    submittedAt
    updatedAt
    declineReason
    refundStatus
    patient {
      id
      firstName
      lastName
      email
      dateOfBirth
    }
    clinician {
      id
      firstName
      lastName
    }
    redFlags {
      id
      description
      severity
    }
    prescription {
      ...PrescriptionFields
    }
    quizAnswers {
      questionId
      question
      answer
      section
    }
    questionnaireVersion
  }
`;

export const CONSULTATION_QUEUE = gql`
  ${CONSULTATION_FRAGMENT}
  query ConsultationQueue {
    consultationQueue {
      ...ConsultationFields
    }
  }
`;

export const GET_CONSULTATION = gql`
  ${CONSULTATION_FRAGMENT}
  query GetConsultation($id: ID!) {
    consultation(id: $id) {
      ...ConsultationFields
      messages {
        id
        senderId
        senderRole
        content
        sentAt
      }
    }
  }
`;

export const PATIENT_HISTORY = gql`
  query PatientHistory($patientId: ID!) {
    patientHistory(patientId: $patientId) {
      id
      kind
      status
      submittedAt
      redFlags {
        severity
      }
      prescription {
        medication
        issuedAt
      }
    }
  }
`;

export const APPROVE_CONSULTATION = gql`
  ${CONSULTATION_FRAGMENT}
  mutation ApproveConsultation($input: ApproveConsultationInput!) {
    approveConsultation(input: $input) {
      ...ConsultationFields
    }
  }
`;

export const DECLINE_CONSULTATION = gql`
  ${CONSULTATION_FRAGMENT}
  mutation DeclineConsultation($input: DeclineConsultationInput!) {
    declineConsultation(input: $input) {
      ...ConsultationFields
    }
  }
`;

export const REQUEST_MORE_INFO = gql`
  ${CONSULTATION_FRAGMENT}
  mutation RequestMoreInfo($consultationId: ID!, $message: String) {
    requestMoreInfo(consultationId: $consultationId, message: $message) {
      ...ConsultationFields
    }
  }
`;

export const CLAIM_CONSULTATION = gql`
  ${CONSULTATION_FRAGMENT}
  mutation ClaimConsultation($id: ID!) {
    claimConsultation(id: $id) {
      ...ConsultationFields
    }
  }
`;

export const RELEASE_CONSULTATION = gql`
  ${CONSULTATION_FRAGMENT}
  mutation ReleaseConsultation($id: ID!) {
    releaseConsultation(id: $id) {
      ...ConsultationFields
    }
  }
`;

export const PRESCRIBING_CHECK = gql`
  query PrescribingCheck($consultationId: ID!, $items: [PrescriptionItemInput!]!) {
    prescribingCheck(consultationId: $consultationId, items: $items) {
      code
      message
      overridable
    }
  }
`;

export const CANCEL_PRESCRIPTION = gql`
  mutation CancelPrescription($id: ID!, $reason: String!) {
    cancelPrescription(id: $id, reason: $reason) {
      id
      status
      cancelledAt
      cancelReason
    }
  }
`;

export const CHANGE_DOSE = gql`
  ${PRESCRIPTION_FRAGMENT}
  mutation ChangeDose($input: ChangeDoseInput!) {
    changeDose(input: $input) {
      ...PrescriptionFields
    }
  }
`;

export const PATIENT_PRESCRIPTIONS = gql`
  ${PRESCRIPTION_FRAGMENT}
  query PatientPrescriptions($patientId: ID!) {
    patientPrescriptions(patientId: $patientId) {
      ...PrescriptionFields
      consultation {
        id
        kind
      }
    }
  }
`;
