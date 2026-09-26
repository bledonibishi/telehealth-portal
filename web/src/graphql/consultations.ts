import { gql } from '@apollo/client';

export const MY_CONSULTATIONS = gql`
  query MyConsultations {
    myConsultations {
      id
      kind
      status
      submittedAt
      prescription {
        id
        medication
        dosage
        issuedAt
        dispatchedAt
        pharmacyRef
        outForDeliveryAt
        deliveredAt
        trackingUrl
      }
      redFlags {
        severity
      }
    }
  }
`;

export const MY_CONSULTATION = gql`
  query MyConsultation($id: ID!) {
    myConsultation(id: $id) {
      id
      kind
      status
      submittedAt
      updatedAt
      quizAnswers {
        questionId
        question
        answer
      }
      prescription {
        id
        medication
        dosage
        instructions
        issuedAt
        pharmacyRef
        dispatchedAt
      }
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
