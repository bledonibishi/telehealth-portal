import React, { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { notificationText } from '@telehealth/shared-types';
import { Button, Card, CardTitle, Divider, Empty, ErrorText, Screen } from '../../components/ui';
import { ToggleRow } from '../../components/ToggleRow';
import { ErrorNotice } from '../../components/ErrorNotice';
import { NotificationRow } from '../../components/NotificationRow';
import { MARK_ALL_NOTIFICATIONS_READ, MY_NOTIFICATIONS, MY_NOTIFICATION_PREFERENCES, MY_TREATMENT_PLAN, UNREAD_NOTIFICATION_COUNT, UPDATE_NOTIFICATION_PREFERENCES } from '../../graphql/operations';
import { iconForKind, markNoticeRead, openHref } from '../../lib/notices';
import { remindersFrom } from '../../lib/reminders';
import { SegmentedControl } from '../../components/SegmentedControl';
import { MY_APPOINTMENTS, MY_SUPPLY_STATUS } from '../../graphql/portal';
import { timeAgo } from '../../lib/format';
import { SkeletonRows } from '../../components/Skeleton';

type Notice = { id: string; kind: string; href: string | null; count: number; readAt: string | null; updatedAt: string; params: Array<{ key: string; value: string }> };

type Prefs = { pushMessages: boolean; pushOrders: boolean; pushReminders: boolean; pushRewards: boolean; emailUnreadMessages: boolean };

const OPTIONS: Array<{ key: keyof Prefs; label: string; hint: string }> = [
  { key: 'pushMessages', label: 'Messages from your care team', hint: 'When your doctor writes.' },
  { key: 'pushOrders', label: 'Order updates', hint: 'Shipped, out for delivery, arrived.' },
  { key: 'pushReminders', label: 'Reminders', hint: 'Doses, check-ins and appointments.' },
  { key: 'pushRewards', label: 'Rewards', hint: 'When you earn one for inviting a friend.' },
  { key: 'emailUnreadMessages', label: 'Email about unread messages', hint: 'One email if a message is still unread after a few hours.' },
];

/** What the patient is pushed and emailed. Important news (a treatment decision, a refund) is always sent. */
function Preferences() {
  const { data } = useQuery(MY_NOTIFICATION_PREFERENCES, { fetchPolicy: 'cache-and-network' });
  const [save, { error }] = useMutation(UPDATE_NOTIFICATION_PREFERENCES);
  const prefs: Prefs | undefined = data?.myNotificationPreferences;
  if (!prefs) return null;
  const set = (key: keyof Prefs, value: boolean) =>
    save({
      variables: { input: { [key]: value } },
      optimisticResponse: { updateMyNotificationPreferences: { __typename: 'NotificationPreferencesModel', ...prefs, [key]: value } },
    }).catch(() => undefined);
  return (
    <Card style={{ padding: 4, marginTop: 14 }}>
      <CardTitle title="What we send you" subtitle="Important news, like a treatment decision or a refund, is always sent." />
      <Divider />
      {OPTIONS.map((o) => <ToggleRow key={o.key} label={o.label} hint={o.hint} value={prefs[o.key]} onValueChange={(v) => set(o.key, v)} />)}
      <ErrorText error={error} />
    </Card>
  );
}

/** What happened: replies from the care team, decisions, orders on their way. Newest first; unread ones stand out. */
export function NotificationsScreen() {
  const { data, loading, error, refetch, fetchMore } = useQuery(MY_NOTIFICATIONS, { fetchPolicy: 'cache-and-network', notifyOnNetworkStatusChange: true });
  const [markAll, { loading: marking, error: markError }] = useMutation(MARK_ALL_NOTIFICATIONS_READ, { refetchQueries: [MY_NOTIFICATIONS, UNREAD_NOTIFICATION_COUNT] });
  const [olderDone, setOlderDone] = useState(false);
  const [tab, setTab] = useState<'news' | 'todo' | null>(null);
  const { data: apptData } = useQuery(MY_APPOINTMENTS, { fetchPolicy: 'cache-and-network' });
  const { data: planData } = useQuery(MY_TREATMENT_PLAN, { fetchPolicy: 'cache-and-network' });
  const { data: supplyData } = useQuery(MY_SUPPLY_STATUS, { fetchPolicy: 'cache-and-network' });
  const reminders = remindersFrom({ appointments: apptData?.myAppointments, plan: planData?.myTreatmentPlan, supply: supplyData?.mySupplyStatus });
  const notices: Notice[] = data?.myNotifications ?? [];
  const unread: number = data?.unreadNotificationCount ?? 0;
  // Opens on the news when there is any unread, otherwise on what is left to do.
  const view = tab ?? (unread === 0 && reminders.length > 0 ? 'todo' : 'news');

  const open = (n: Notice) => {
    if (!n.readAt) void markNoticeRead(n.id).then(() => refetch());
    openHref(n.href);
  };
  const showOlder = async () => {
    const last = notices[notices.length - 1];
    if (!last) return;
    const more = await fetchMore({
      variables: { before: last.updatedAt },
      updateQuery: (prev: any, { fetchMoreResult }: any) => ({ ...prev, myNotifications: [...prev.myNotifications, ...fetchMoreResult.myNotifications] }),
    });
    if ((more.data?.myNotifications?.length ?? 0) < 20) setOlderDone(true);
  };

  return (
    <Screen
      title="Notifications"
      subtitle={unread ? `${unread} unread` : 'You’re all caught up.'}
      refreshing={loading && !!data}
      onRefresh={() => { setOlderDone(false); refetch(); }}
      right={view === 'news' && unread > 0 ? <Button small variant="outline" label="Mark all read" loading={marking} onPress={() => markAll().catch(() => undefined)} /> : undefined}
    >
      <ErrorText error={markError} />
      <SegmentedControl
        value={view}
        onChange={setTab}
        options={[{ value: 'news', label: 'News', count: unread }, { value: 'todo', label: 'To do', count: reminders.length }]}
      />
      {view === 'todo' ? (
        <Card style={{ padding: 4 }}>
          {reminders.length === 0 ? (
            <View style={{ padding: 14 }}><Empty>Nothing to do right now.</Empty></View>
          ) : (
            reminders.map((r) => <NotificationRow key={r.key} title={r.title} body={r.detail} time="" icon={r.icon} tone="warning" onPress={() => openHref(r.href)} />)
          )}
        </Card>
      ) : error && !data ? (
        <ErrorNotice error={error} onRetry={() => refetch()} />
      ) : (
        <Card style={{ padding: 4 }}>
          {notices.length === 0 ? (
            <View style={{ padding: 14 }}>{loading ? <SkeletonRows rows={4} label="Loading your notifications…" /> : <Empty>Nothing yet. We’ll tell you here when your care team writes or your order moves.</Empty>}</View>
          ) : (
            notices.map((n) => {
              const text = notificationText(n.kind, Object.fromEntries(n.params.map((p) => [p.key, p.value])), n.count);
              return <NotificationRow key={n.id} title={text.title} body={text.body} time={timeAgo(n.updatedAt)} icon={iconForKind(n.kind)} tone={text.tone} unread={!n.readAt} onPress={() => open(n)} />;
            })
          )}
          {notices.length >= 20 && !olderDone && <Button small variant="outline" label="Show older" onPress={showOlder} style={{ margin: 8 }} />}
        </Card>
      )}
      <Preferences />
    </Screen>
  );
}
