import { gql } from '@apollo/client';

export const GET_NOTIFICATION_COUNTS = gql`
  query GetNotificationCounts {
    notificationCounts {
      newLeads
      pendingConsultations
      patientMessages
      pendingOrders
    }
  }
`;
