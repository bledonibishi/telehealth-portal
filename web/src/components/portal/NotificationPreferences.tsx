'use client';

import { useMutation, useQuery } from '@apollo/client';
import { MY_NOTIFICATION_PREFERENCES, UPDATE_NOTIFICATION_PREFERENCES } from '@/graphql/notifications';
import { InlineError } from '@/components/common/Alert';

type Prefs = { pushMessages: boolean; pushOrders: boolean; pushReminders: boolean; pushRewards: boolean; emailUnreadMessages: boolean };

const OPTIONS: Array<{ key: keyof Prefs; label: string; hint: string }> = [
  { key: 'pushMessages', label: 'Messages from your care team', hint: 'A notification on your phone when your doctor writes.' },
  { key: 'pushOrders', label: 'Order updates', hint: 'When your order ships, is out for delivery or arrives.' },
  { key: 'pushReminders', label: 'Reminders', hint: 'Doses, check-ins and appointments.' },
  { key: 'pushRewards', label: 'Rewards', hint: 'When you earn a reward for inviting a friend.' },
  { key: 'emailUnreadMessages', label: 'Email me about unread messages', hint: 'One email if a message from your care team is still unread after a few hours.' },
];

/**
 * What the patient is told about on their phone, and by email. The notifications list in the app always shows
 * everything; important news (a decision about your treatment, a refund) is always sent and can't be switched off.
 */
export function NotificationPreferences() {
  const { data, error } = useQuery(MY_NOTIFICATION_PREFERENCES);
  const [save, { error: saveError }] = useMutation(UPDATE_NOTIFICATION_PREFERENCES);
  const prefs: Prefs | undefined = data?.myNotificationPreferences;

  const toggle = (key: keyof Prefs) => {
    if (!prefs) return;
    const next = !prefs[key];
    save({
      variables: { input: { [key]: next } },
      optimisticResponse: { updateMyNotificationPreferences: { __typename: 'NotificationPreferencesModel', ...prefs, [key]: next } },
    }).catch(() => undefined);
  };

  if (error) return <InlineError error={error} />;
  if (!prefs) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {OPTIONS.map((o) => (
          <li key={o.key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-900">{o.label}</p>
              <p className="text-xs text-slate-500">{o.hint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[o.key]}
              aria-label={o.label}
              onClick={() => toggle(o.key)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${prefs[o.key] ? 'bg-ink-700' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${prefs[o.key] ? 'translate-x-5' : ''}`} />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">Important news, like a decision about your treatment or a refund, is always sent.</p>
      {saveError && <InlineError error={saveError} className="mt-2" />}
    </div>
  );
}
