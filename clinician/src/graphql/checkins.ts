import { gql } from '@apollo/client';

export const RESCHEDULE_CHECK_IN = gql`
  mutation RescheduleCheckIn($id: ID!, $dueAt: DateTime!) {
    rescheduleCheckIn(id: $id, dueAt: $dueAt) {
      id
      status
      dueAt
    }
  }
`;
