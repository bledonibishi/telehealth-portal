import React, { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Card, CardTitle, ErrorText, Screen } from '../../components/ui';
import { ToggleRow } from '../../components/ToggleRow';
import { MY_NOTIFICATION_PREFERENCES, UPDATE_NOTIFICATION_PREFERENCES } from '../../graphql/profile';

type Prefs = { pushMessages: boolean; pushOrders: boolean; pushReminders: boolean; pushRewards: boolean; emailUnreadMessages: boolean };

const PUSH: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: 'pushMessages', label: 'Messages', hint: 'When your care team writes to you.' },
  { key: 'pushOrders', label: 'Orders and deliveries', hint: 'Shipping, delivery and payment updates.' },
  { key: 'pushReminders', label: 'Reminders', hint: 'Doses, check-ins and appointments.' },
  { key: 'pushRewards', label: 'Rewards', hint: 'Referral rewards and offers.' },
];

/** What reaches the phone as a notification, and whether an unread message is followed up by email. Each switch saves at once. */
export function NotificationSettingsScreen() {
  const { data } = useQuery(MY_NOTIFICATION_PREFERENCES, { fetchPolicy: 'cache-and-network' });
  const [save] = useMutation(UPDATE_NOTIFICATION_PREFERENCES);
  const [problem, setProblem] = useState<unknown>(null);
  const prefs: Prefs | undefined = data?.myNotificationPreferences;

  const toggle = async (key: keyof Prefs, value: boolean) => {
    setProblem(null);
    try {
      await save({
        variables: { input: { [key]: value } },
        // The switches read the saved preferences, so the saved answer is written back into them.
        update: (cache, { data: result }) => {
          if (result?.updateMyNotificationPreferences) cache.writeQuery({ query: MY_NOTIFICATION_PREFERENCES, data: { myNotificationPreferences: result.updateMyNotificationPreferences } });
        },
        // Flips at once; Apollo puts the old value back if the server refuses.
        optimisticResponse: prefs ? { updateMyNotificationPreferences: { __typename: 'NotificationPreferencesModel', ...prefs, [key]: value } } : undefined,
      });
    } catch (e) {
      setProblem(e);
    }
  };

  return (
    <Screen title="Notifications" subtitle="Choose what reaches you, and where.">
      <Card style={{ paddingHorizontal: 0 }}>
        <CardTitle title="On your phone" />
        {PUSH.map((p) => (
          <ToggleRow key={p.key} label={p.label} hint={p.hint} value={prefs?.[p.key] ?? true} disabled={!prefs} onValueChange={(v) => toggle(p.key, v)} />
        ))}
      </Card>
      <Card style={{ paddingHorizontal: 0, marginTop: 14 }}>
        <CardTitle title="By email" />
        <ToggleRow label="Unread messages" hint="An email if you haven’t read a message from your care team." value={prefs?.emailUnreadMessages ?? true} disabled={!prefs} onValueChange={(v) => toggle('emailUnreadMessages', v)} />
      </Card>
      <ErrorText error={problem} />
    </Screen>
  );
}
