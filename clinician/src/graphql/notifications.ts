import { gql } from '@apollo/client';

export const GET_NOTIFICATION_COUNTS = gql`
  query GetNotificationCounts {
    notificationCounts {
      newLeads
      pendingConsultations
      patientMessages
      pendingOrders
      missedDoseAlerts
      shipmentsDue
      sideEffectAlerts
      urgentAppointments
      orderProblems
      refundRequests
    }
  }
`;

export const NOTIFICATION_FIELDS = gql`
  fragment NotificationFields on NotificationItem {
    id
    kind
    href
    count
    readAt
    updatedAt
    params { key value }
  }
`;

export const MY_NOTIFICATIONS = gql`
  query MyNotifications($before: DateTime) {
    myNotifications(limit: 20, before: $before) { ...NotificationFields }
    unreadNotificationCount
  }
  ${NOTIFICATION_FIELDS}
`;

export const UNREAD_NOTIFICATION_COUNT = gql`
  query UnreadNotificationCount {
    unreadNotificationCount
  }
`;

export const MARK_NOTIFICATIONS_READ = gql`
  mutation MarkNotificationsRead($ids: [ID!]!) {
    markNotificationsRead(ids: $ids)
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;
