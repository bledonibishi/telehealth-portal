import { gql } from '@apollo/client';

export const GET_MESSAGES = gql`
  query GetMessages($consultationId: ID!) {
    messages(consultationId: $consultationId) {
      id
      senderId
      senderRole
      content
      sentAt
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
