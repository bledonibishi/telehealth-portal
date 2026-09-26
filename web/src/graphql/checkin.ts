import { gql } from '@apollo/client';

export const CHECK_IN_BY_TOKEN = gql`
  query CheckInByToken($token: String!) {
    checkInByToken(token: $token) {
      id
      status
      dueAt
      patientFirstName
    }
  }
`;

export const SUBMIT_CHECK_IN = gql`
  mutation SubmitCheckIn($token: String!, $input: SubmitCheckInInput!) {
    submitCheckIn(token: $token, input: $input) {
      id
      status
      completedAt
    }
  }
`;
