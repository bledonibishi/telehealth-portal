import { gql } from '@apollo/client';

const CONSULTATION_FRAGMENT = gql`
  fragment ConsultationFields on Consultation {
    id
    kind
    status
    submittedAt
    updatedAt
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
      id
      medication
      dosage
      instructions
      issuedAt
      pharmacyRef
    }
    quizAnswers {
      questionId
      question
      answer
    }
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
  mutation RequestMoreInfo($consultationId: ID!) {
    requestMoreInfo(consultationId: $consultationId) {
      ...ConsultationFields
    }
  }
`;
