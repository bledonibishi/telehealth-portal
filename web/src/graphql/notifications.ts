import { gql } from '@apollo/client';

export const MY_NOTIFICATIONS = gql`
  query MyNotifications($before: DateTime) {
    myNotifications(limit: 20, before: $before) {
      id
      kind
      href
      count
      readAt
      updatedAt
      params { key value }
    }
    unreadNotificationCount
  }
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

export const MY_NOTIFICATION_PREFERENCES = gql`
  query MyNotificationPreferences {
    myNotificationPreferences { pushMessages pushOrders pushReminders pushRewards emailUnreadMessages }
  }
`;

export const UPDATE_NOTIFICATION_PREFERENCES = gql`
  mutation UpdateMyNotificationPreferences($input: UpdateNotificationPreferencesInput!) {
    updateMyNotificationPreferences(input: $input) { pushMessages pushOrders pushReminders pushRewards emailUnreadMessages }
  }
`;
