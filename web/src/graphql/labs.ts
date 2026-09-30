import { gql } from '@apollo/client';

export const MY_TRT_MONITORING = gql`
  query MyTrtMonitoring {
    myTrtMonitoring {
      refillsOnHold
      labs {
        kind
        dueAt
        overdue
        lastCollectedAt
      }
    }
  }
`;
