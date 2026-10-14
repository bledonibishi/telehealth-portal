import { gql } from '@apollo/client';

const TICKET_FIELDS = gql`
  fragment TicketFields on Ticket {
    id
    number
    type
    status
    priority
    subject
    description
    patientId
    patientName
    assigneeId
    assigneeName
    createdAt
    updatedAt
    firstResponseAt
    replyDueAt
    resolvedAt
    engineeringSentAt
    engineeringSentByName
    engineeringNote
    engineeringDoneAt
    notes {
      id
      authorName
      body
      createdAt
    }
    attachments {
      id
      filename
      mimeType
      createdAt
    }
  }
`;

export const GET_TICKETS = gql`
  query GetTickets($filter: TicketFilterInput) {
    supportTickets(filter: $filter) {
      ...TicketFields
    }
  }
  ${TICKET_FIELDS}
`;

export const GET_TICKET_HANDLERS = gql`
  query GetTicketHandlers($clinical: Boolean!) {
    ticketHandlers(clinical: $clinical) {
      id
      name
    }
  }
`;

export const CREATE_TICKET = gql`
  mutation CreateTicket($input: CreateTicketInput!) {
    createTicket(input: $input) {
      ...TicketFields
    }
  }
  ${TICKET_FIELDS}
`;

export const UPDATE_TICKET = gql`
  mutation UpdateTicket($input: UpdateTicketInput!) {
    updateTicket(input: $input) {
      ...TicketFields
    }
  }
  ${TICKET_FIELDS}
`;

export const ADD_TICKET_NOTE = gql`
  mutation AddTicketNote($ticketId: ID!, $body: String!) {
    addTicketNote(ticketId: $ticketId, body: $body) {
      ...TicketFields
    }
  }
  ${TICKET_FIELDS}
`;

export const PERFORM_SUPPORT_ACTION = gql`
  mutation PerformSupportAction($input: PerformSupportActionInput!) {
    performSupportAction(input: $input) {
      ok
      message
    }
  }
`;

export const GET_TICKET = gql`
  query GetTicket($id: ID!) {
    ticket(id: $id) {
      ...TicketFields
    }
  }
  ${TICKET_FIELDS}
`;

export const SUPPORT_ACTION_CONTEXT = gql`
  query SupportActionContext($patientId: ID!) {
    supportActionContext(patientId: $patientId) {
      patientName
      email
      activated
      hasPaymentProfile
      actions {
        action
        available
        unavailableReason
        cooldownUntil
      }
      history {
        id
        action
        at
        byName
        ok
        outcome
        reason
      }
    }
  }
`;

export const TICKET_CONVERSATION = gql`
  query TicketConversation($ticketId: ID!) {
    ticketConversation(ticketId: $ticketId) {
      id
      senderId
      senderRole
      isAi
      aiFeedback
      aiArticleId
      content
      sentAt
      attachments {
        id
        filename
        mimeType
      }
    }
  }
`;

export const REPLY_TO_TICKET = gql`
  mutation ReplyToTicket($ticketId: ID!, $content: String!) {
    replyToTicket(ticketId: $ticketId, content: $content) {
      message {
        id
      }
      ticket {
        ...TicketFields
      }
    }
  }
  ${TICKET_FIELDS}
`;

export const SAVED_REPLIES = gql`
  query SavedReplies {
    savedReplies {
      id
      title
      body
    }
  }
`;

export const SAVE_SAVED_REPLY = gql`
  mutation SaveSavedReply($input: SavedReplyInput!) {
    saveSavedReply(input: $input) {
      id
      title
      body
    }
  }
`;

export const REMOVE_SAVED_REPLY = gql`
  mutation RemoveSavedReply($id: ID!) {
    removeSavedReply(id: $id)
  }
`;

export const SEND_TICKET_TO_ENGINEERING = gql`
  mutation SendTicketToEngineering($ticketId: ID!, $note: String!) {
    sendTicketToEngineering(ticketId: $ticketId, note: $note) {
      slack
      ticket {
        ...TicketFields
      }
    }
  }
  ${TICKET_FIELDS}
`;

export const FINISH_TICKET_ENGINEERING = gql`
  mutation FinishTicketEngineering($ticketId: ID!) {
    finishTicketEngineering(ticketId: $ticketId) {
      ...TicketFields
    }
  }
  ${TICKET_FIELDS}
`;
