import { gql } from '@apollo/client';

export const GET_MESSAGES = gql`
  query GetMessages($consultationId: ID!) {
    messages(consultationId: $consultationId) {
      id
      senderId
      senderRole
      content
      sentAt
      readAt
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
      readAt
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
      readAt
    }
  }
`;

// A patient's messages live on each of their consultations; the chat shows them as one conversation.
// Consultations come newest first, and replies go to the newest one.
export const PATIENT_CONVERSATION = gql`
  query PatientConversation($id: ID!) {
    patient(id: $id) {
      id
      consultations {
        id
        submittedAt
        messages {
          id
          senderId
          senderRole
          content
          sentAt
          readAt
        }
      }
    }
  }
`;

export const MARK_MESSAGES_READ = gql`
  mutation MarkMessagesRead($consultationId: ID!) {
    markMessagesRead(consultationId: $consultationId)
  }
`;

export const MESSAGES_READ_SUBSCRIPTION = gql`
  subscription MessagesRead($consultationId: ID!) {
    messagesRead(consultationId: $consultationId) {
      consultationId
      byPatient
      readAt
    }
  }
`;
