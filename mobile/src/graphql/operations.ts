import { gql } from '@apollo/client';

export const LOGIN_PATIENT = gql`
  mutation LoginPatient($input: LoginInput!) {
    loginPatient(input: $input) {
      accessToken
      patient {
        id
        email
        firstName
        lastName
      }
    }
  }
`;

export const SUBMIT_INTAKE_QUIZ = gql`
  mutation SubmitIntakeQuiz($input: SubmitIntakeQuizInput!) {
    submitIntakeQuiz(input: $input) {
      id
      kind
      status
      submittedAt
      redFlags {
        id
        description
        severity
      }
    }
  }
`;

export const MY_CONSULTATIONS = gql`
  query MyConsultations {
    myConsultations {
      id
      kind
      status
      submittedAt
      updatedAt
      prescription {
        medication
        dosage
        issuedAt
      }
    }
  }
`;

export const GET_MY_CONSULTATION = gql`
  query GetMyConsultation($id: ID!) {
    consultation(id: $id) {
      id
      kind
      status
      submittedAt
      updatedAt
      redFlags {
        description
        severity
      }
      prescription {
        medication
        dosage
        instructions
        issuedAt
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

export const SEND_MESSAGE = gql`
  mutation SendMessage($input: SendMessageInput!) {
    sendMessage(input: $input) {
      id
      senderId
      senderRole
      content
      sentAt
    }
  }
`;

export const NEW_MESSAGE_SUBSCRIPTION = gql`
  subscription NewMessage($consultationId: ID!) {
    newMessage(consultationId: $consultationId) {
      id
      senderId
      senderRole
      content
      sentAt
    }
  }
`;
