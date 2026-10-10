'use client';

import { useState, useRef, useEffect } from 'react';
import { useApolloClient, useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { notificationText, type NotificationTone } from '@telehealth/shared-types';
import {
  GET_NOTIFICATION_COUNTS,
  MARK_ALL_NOTIFICATIONS_READ,
  MARK_NOTIFICATIONS_READ,
  MY_NOTIFICATIONS,
  UNREAD_NOTIFICATION_COUNT,
} from '@/graphql/notifications';
import { getCurrentRole, type ClinicianRole } from '@/lib/role';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';
import { LoadingState } from '@telehealth/loading';

type Notice = { id: string; kind: string; href: string | null; count: number; readAt: string | null; updatedAt: string; params: Array<{ key: string; value: string }> };

type Waiting = { label: string; key: string; href: string; roles: ClinicianRole[]; icon: string; attention?: boolean };

// What is waiting right now (the same numbers as the menu badges). `attention`: a problem rather than ordinary work.
const WAITING: Waiting[] = [
  { label: 'New leads today', key: 'newLeads', href: '/leads', roles: ['ADMIN', 'CX_TEAM'], icon: '🎯' },
  { label: 'Consultations awaiting review', key: 'pendingConsultations', href: '/queue', roles: ['ADMIN', 'DOCTOR'], icon: '📋' },
  { label: 'Patient messages with no reply', key: 'patientMessages', href: '/patients', roles: ['ADMIN', 'DOCTOR', 'CX_TEAM'], icon: '💬' },
  { label: 'Orders pending dispatch', key: 'pendingOrders', href: '/orders', roles: ['ADMIN', 'PROVIDER'], icon: '📦' },
  { label: 'GLP-1 patients with missed doses', key: 'missedDoseAlerts', href: '/check-ins', roles: ['ADMIN', 'DOCTOR'], icon: '💉' },
  { label: 'Shipments due or late', key: 'shipmentsDue', href: '/shipments', roles: ['ADMIN', 'DOCTOR'], icon: '🚚' },
  { label: 'Side effects reported by patients', key: 'sideEffectAlerts', href: '/check-ins', roles: ['ADMIN', 'DOCTOR'], icon: '🩺', attention: true },
  { label: 'Urgent appointment requests (24h)', key: 'urgentAppointments', href: '/appointments', roles: ['ADMIN', 'DOCTOR'], icon: '📅', attention: true },
  { label: 'Orders with a delivery problem', key: 'orderProblems', href: '/orders', roles: ['ADMIN'], icon: '⚠️', attention: true },
  { label: 'Refund requests from patients', key: 'refundRequests', href: '/orders', roles: ['ADMIN'], icon: '💶', attention: true },
];

const TONE_DOT: Record<NotificationTone, string> = {
  urgent: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
};

/**
 * The bell: what happened that concerns the signed-in staff member (newest first, unread ones marked), and above it
 * what is waiting for their role right now. Opening a notification marks it read; one about something already handled
 * by a colleague (the patient got a reply, the request was answered) is read already.
 */
export function NotificationBell() {
  const { t, timeAgo } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const client = useApolloClient();
  const role = getCurrentRole();
  // The pharmacy partner has no inbox: nothing it may see is sent to it as a notification.
  const hasInbox = role !== 'PROVIDER';

  const { data: unreadData } = useQuery(UNREAD_NOTIFICATION_COUNT, { pollInterval: 30_000, skip: !hasInbox });
  const { data: countsData } = useQuery(GET_NOTIFICATION_COUNTS, { pollInterval: 30_000 });
  const [load, { data, loading, error, fetchMore, refetch }] = useLazyQuery(MY_NOTIFICATIONS, { fetchPolicy: 'network-only' });
  const [markRead] = useMutation(MARK_NOTIFICATIONS_READ);
  const [markAll, { error: markError }] = useMutation(MARK_ALL_NOTIFICATIONS_READ);
  const [olderDone, setOlderDone] = useState(false);
  const [tab, setTab] = useState<'inbox' | 'waiting'>('inbox');

  const unread: number = unreadData?.unreadNotificationCount ?? 0;
  const notices: Notice[] = data?.myNotifications ?? [];
  const counts = countsData?.notificationCounts ?? {};
  const waiting = WAITING.filter((w) => (!role || w.roles.includes(role)) && (counts[w.key] ?? 0) > 0);

  // Opens on what needs doing: the new notifications if there are any, else the work waiting.
  useEffect(() => {
    if (open) setTab(!hasInbox || (unread === 0 && waiting.length > 0) ? 'waiting' : 'inbox');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !hasInbox) return;
    setOlderDone(false);
    if (data) refetch(); else load();
    // Only on opening: the list does not need to move under the reader's mouse.
  }, [open]);

  // Close on a click outside or Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  /** Shows it as read straight away; the server is told in the background. */
  const setReadLocally = (ids: string[]) => {
    const now = new Date().toISOString();
    for (const id of ids) client.cache.modify({ id: client.cache.identify({ __typename: 'NotificationItem', id }), fields: { readAt: (v) => v ?? now } });
    client.cache.writeQuery({ query: UNREAD_NOTIFICATION_COUNT, data: { unreadNotificationCount: Math.max(0, unread - ids.length) } });
  };

  const openNotice = (n: Notice) => {
    if (!n.readAt) {
      setReadLocally([n.id]);
      markRead({ variables: { ids: [n.id] } }).catch(() => undefined);
    }
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  const readAll = async () => {
    const ids = notices.filter((n) => !n.readAt).map((n) => n.id);
    await markAll();
    setReadLocally(ids);
    client.cache.writeQuery({ query: UNREAD_NOTIFICATION_COUNT, data: { unreadNotificationCount: 0 } });
  };

  const showOlder = async () => {
    const last = notices[notices.length - 1];
    if (!last) return;
    const more = await fetchMore({
      variables: { before: last.updatedAt },
      updateQuery: (prev, { fetchMoreResult }) => ({ ...prev, myNotifications: [...prev.myNotifications, ...fetchMoreResult.myNotifications] }),
    });
    if ((more.data?.myNotifications?.length ?? 0) < 20) setOlderDone(true);
  };

  const badge = hasInbox ? unread : waiting.reduce((sum, w) => sum + counts[w.key], 0);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={badge ? t('Notifications, {count} unread', { count: badge }) : t('Notifications')}
        className="relative p-1.5 rounded-lg text-[color:var(--t-muted)] hover:text-[color:var(--t-strong)] hover:bg-[color:var(--bg-hover)]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-[22rem] max-w-[calc(100vw-2rem)] rounded-md shadow-lg border z-50 overflow-hidden bg-[color:var(--bg-panel)] border-[color:var(--border)]">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-[color:var(--t-strong)]">{t('Notifications')}</p>
            {hasInbox && tab === 'inbox' && unread > 0 && (
              <button type="button" onClick={readAll} className="text-xs font-medium text-brand-500 hover:underline">{t('Mark all as read')}</button>
            )}
          </div>
          {markError && <InlineError error={markError} className="px-4 pb-2" />}

          {hasInbox && (
            <div role="tablist" className="mx-4 mb-2 flex rounded-lg p-0.5 bg-[color:var(--bg-subtle)]">
              {([['inbox', t('Notifications'), unread], ['waiting', t('Waiting for you'), 0]] as const).map(([key, label, n]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${tab === key ? 'bg-[color:var(--bg-card)] text-[color:var(--t-strong)] shadow-sm' : 'text-[color:var(--t-muted)] hover:text-[color:var(--t-strong)]'}`}
                >
                  {label}
                  {n > 0 && <span className={`rounded-full px-1.5 text-[10px] font-bold ${key === 'inbox' ? 'bg-red-500 text-white' : 'bg-[color:var(--bg-hover)] text-[color:var(--t-strong)]'}`}>{n}</span>}
                </button>
              ))}
            </div>
          )}

          {tab === 'waiting' && (
            <div className="max-h-[26rem] overflow-y-auto border-t border-[color:var(--border-subtle)]">
              {waiting.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[color:var(--t-dim)]">{t('Nothing is waiting for you 🎉')}</p>
              ) : (
                <ul className="py-1">
                  {waiting.map((w) => (
                    <li key={w.key}>
                      <button
                        type="button"
                        onClick={() => { setOpen(false); router.push(w.href); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[color:var(--bg-hover)]"
                      >
                        <span className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-base bg-[color:var(--bg-subtle)]" aria-hidden>{w.icon}</span>
                        <span className="flex-1 min-w-0 text-sm text-[color:var(--t-body)]">{t(w.label)}</span>
                        <span className={`min-w-[1.75rem] text-center rounded-full px-2 py-0.5 text-xs font-bold ${w.attention ? 'bg-red-100 text-red-700' : 'bg-[color:var(--bg-subtle)] text-[color:var(--t-strong)]'}`}>{counts[w.key]}</span>
                        <span className="text-[color:var(--t-dim)]" aria-hidden>›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {hasInbox && tab === 'inbox' && (
            <div className="max-h-[26rem] border-t border-[color:var(--border-subtle)] overflow-y-auto">
              {error ? (
                <InlineError error={error} className="px-4 py-3" />
              ) : loading && notices.length === 0 ? (
                <LoadingState label={t('Loading…')} className="px-4 !py-6" />
              ) : notices.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[color:var(--t-dim)]">{t('All caught up 🎉')}</p>
              ) : (
                <ul className="divide-y divide-[color:var(--border-subtle)]">
                  {notices.map((n) => {
                    const params = Object.fromEntries(n.params.map((p) => [p.key, p.value]));
                    const text = notificationText(n.kind, params, n.count, t);
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openNotice(n)}
                          className={`w-full flex gap-3 px-4 py-3 text-left hover:bg-[color:var(--bg-hover)] ${n.readAt ? '' : 'bg-[color:var(--bg-subtle)]'}`}
                        >
                          <span className={`mt-1.5 w-2 h-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : TONE_DOT[text.tone]}`} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm ${n.readAt ? 'text-[color:var(--t-body)]' : 'font-semibold text-[color:var(--t-strong)]'}`}>
                              {text.tone === 'urgent' && <span className="mr-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">{t('Urgent')}</span>}
                              {text.title}
                            </span>
                            <span className="block text-xs text-[color:var(--t-muted)]">{text.body}</span>
                            <span className="block mt-0.5 text-[11px] text-[color:var(--t-dim)]">{timeAgo(n.updatedAt)}</span>
                          </span>
                          {!n.readAt && <span className="sr-only">{t('Unread')}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {notices.length >= 20 && !olderDone && (
                <button type="button" onClick={showOlder} className="w-full py-2.5 text-xs font-medium text-brand-500 hover:bg-[color:var(--bg-hover)] border-t border-[color:var(--border-subtle)]">
                  {t('Show older')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
