import { apolloClient } from './apollo';
import { navigationRef } from '../navigation/navigationRef';
import { MARK_NOTIFICATIONS_READ, UNREAD_NOTIFICATION_COUNT } from '../graphql/operations';

/**
 * Where a notification leads in the app. The backend links each one to a page of the patient web portal; this is the
 * same place here. Anything without a screen of its own opens the notifications list.
 */
const ROUTES: Record<string, [string, object?]> = {
  '/messages': ['Messages'],
  '/dashboard': ['Status'],
  '/doses': ['Injections'],
  '/orders': ['More', { screen: 'Orders' }],
  '/settings': ['More', { screen: 'Account' }],
  '/appointments': ['More', { screen: 'Doctor' }],
};

export function openHref(href: string | null | undefined) {
  if (!navigationRef.isReady()) return;
  const [screen, params] = ROUTES[(href ?? '').split('?')[0]] ?? ['More', { screen: 'Notifications' }];
  (navigationRef as any).navigate('Main', { screen, params });
}

/** Marks one notification read and refreshes the badge. Best effort: the list shows it read either way. */
export async function markNoticeRead(id: string) {
  try {
    await apolloClient.mutate({ mutation: MARK_NOTIFICATIONS_READ, variables: { ids: [id] }, refetchQueries: [UNREAD_NOTIFICATION_COUNT] });
  } catch {
    /* the badge catches up on the next refresh */
  }
}

const KIND_ICON: Record<string, string> = {
  CARE_TEAM_MESSAGE: '💬',
  TREATMENT_UPDATE: '📄',
  CHECK_IN_READY: '🩺',
  DOSE_DUE: '💉',
  APPOINTMENT_UPDATE: '📅',
  ORDER_SHIPPED: '🚚',
  ORDER_OUT_FOR_DELIVERY: '🚚',
  ORDER_DELIVERED: '✅',
  ORDER_DELIVERY_FAILED: '⚠️',
  REFUND_APPROVED: '💶',
  REFUND_DECLINED: '✉️',
  REFERRAL_REWARD: '🎁',
};

/** The icon a notification of this kind shows. */
export const iconForKind = (kind: string) => KIND_ICON[kind] ?? '🔔';
