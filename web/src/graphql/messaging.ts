import { gql } from '@apollo/client';

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

// The patient's messages live on each of their consultations; the chat shows them as one conversation.
// Consultations come newest first, and replies go to the newest one. Before there is a consultation,
// messages live on the patient's pre-consultation thread (e.g. asking for help during onboarding).
export const MY_CONVERSATION = gql`
  query MyConversation {
    myConsultations {
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
    myPreConsultationMessages {
      id
      senderId
      senderRole
      content
      sentAt
      readAt
    }
  }
`;

export const MARK_PRE_CONSULTATION_READ = gql`
  mutation MarkPreConsultationMessagesRead {
    markPreConsultationMessagesRead
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
