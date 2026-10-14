import { gql } from '@apollo/client';

export const MY_SUPPORT_REQUESTS = gql`
  query MySupportRequests {
    mySupportRequests {
      id
      number
      type
      status
      subject
      description
      createdAt
      resolvedAt
      attachments {
        id
        filename
      }
    }
  }
`;

export const CREATE_SUPPORT_REQUEST = gql`
  mutation CreateSupportRequest($input: SupportRequestInput!) {
    createSupportRequest(input: $input) {
      id
      number
      type
      status
      subject
      description
      createdAt
      resolvedAt
      attachments {
        id
        filename
      }
    }
  }
`;
