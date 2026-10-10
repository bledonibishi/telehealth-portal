'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApolloClient, useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns';
import { notificationText, type NotificationTone } from '@telehealth/shared-types';
import { MY_PROFILE, MY_PRESCRIPTION_HISTORY } from '@/graphql/portal';
import { MY_SUPPLY_STATUS } from '@/graphql/supply';
import { MY_BOOKINGS } from '@telehealth/booking';
import { MY_DOSE_SUMMARY } from '@/graphql/dosing';
import { MARK_ALL_NOTIFICATIONS_READ, MARK_NOTIFICATIONS_READ, MY_NOTIFICATIONS, UNREAD_NOTIFICATION_COUNT } from '@/graphql/notifications';
import { InlineError } from '@/components/common/Alert';
import { Avatar, Icon, type IconName } from './Icon';

type Note = { key: string; title: string; detail: string; href: string; icon: IconName };

/** Closes a dropdown on Esc or a click outside it. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

const DAY = 86_400_000;

/**
 * Reminders worked out from the patient's own data: things to do now, which stay until they are done (an appointment
 * coming up, a dose due, a supply to order, a prescription running out). What *happened* (a reply, an order on its way,
 * a decision) comes from the server as notifications instead, with read and unread.
 */
function useReminders(): Note[] {
  const { data: booked } = useQuery(MY_BOOKINGS, { fetchPolicy: 'cache-first', pollInterval: 120_000 });
  const { data: dose } = useQuery(MY_DOSE_SUMMARY, { fetchPolicy: 'cache-first' });
  const { data: supply } = useQuery(MY_SUPPLY_STATUS, { fetchPolicy: 'cache-first' });
  const { data: rx } = useQuery(MY_PRESCRIPTION_HISTORY, { fetchPolicy: 'cache-first' });
  const now = Date.now();
  const notes: Note[] = [];

  // An appointment in the next two days.
  for (const b of (booked?.myBookings ?? []) as any[]) {
    const at = Date.parse(b.startsAt);
    if (at > now && at - now < 2 * DAY) {
      const d = new Date(at);
      notes.push({ key: `appt-${b.uid}`, title: 'Appointment coming up', detail: `${isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEE d MMM')} at ${format(d, 'HH:mm')}`, href: '/appointments', icon: 'calendar' });
    }
  }

  const next = dose?.myDoseSummary?.nextDoseAt;
  if (next && Date.parse(next) < now + DAY) {
    notes.push({ key: 'dose', title: Date.parse(next) < now - DAY ? 'An injection is overdue' : 'Injection due today', detail: dose.myDoseSummary.current, href: '/doses', icon: 'syringe' });
  }

  if (supply?.mySupplyStatus?.refillState === 'READY') notes.push({ key: 'refill', title: 'Time to order your next supply', detail: 'Your doctor approves it first', href: '/treatment-plan', icon: 'cart' });

  const active = ((rx?.myPrescriptions ?? []) as any[]).find((p) => p.status === 'ACTIVE');
  if (active?.validUntil && Date.parse(active.validUntil) - now < 14 * DAY && Date.parse(active.validUntil) > now) {
    notes.push({ key: `rx-exp-${active.id}`, title: 'Your prescription runs out soon', detail: `On ${format(new Date(active.validUntil), 'd MMM')} — your doctor renews it at your check-in`, href: '/treatment-plan', icon: 'rx' });
  }
  return notes;
}

type Notice = { id: string; kind: string; href: string | null; count: number; readAt: string | null; updatedAt: string; params: Array<{ key: string; value: string }> };

const TONE_TILE: Record<NotificationTone, string> = {
  urgent: 'bg-red-50 text-red-600',
  warning: 'bg-amber-50 text-amber-600',
  info: 'bg-ink-50 text-ink-700',
  success: 'bg-emerald-50 text-emerald-600',
};

const KIND_ICON: Record<string, IconName> = {
  CARE_TEAM_MESSAGE: 'chat',
  TREATMENT_UPDATE: 'rx',
  CHECK_IN_READY: 'heart',
  DOSE_DUE: 'syringe',
  APPOINTMENT_UPDATE: 'calendar',
  ORDER_SHIPPED: 'truck',
  ORDER_OUT_FOR_DELIVERY: 'truck',
  ORDER_DELIVERED: 'check',
  ORDER_DELIVERY_FAILED: 'alert',
  REFUND_APPROVED: 'check',
  REFUND_DECLINED: 'mail',
  REFERRAL_REWARD: 'gift',
};

function Bell() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const router = useRouter();
  const client = useApolloClient();
  const reminders = useReminders();
  const { data: unreadData } = useQuery(UNREAD_NOTIFICATION_COUNT, { pollInterval: 60_000 });
  const [load, { data, loading, error, refetch, fetchMore }] = useLazyQuery(MY_NOTIFICATIONS, { fetchPolicy: 'network-only' });
  const [markRead] = useMutation(MARK_NOTIFICATIONS_READ);
  const [markAll, { error: markError }] = useMutation(MARK_ALL_NOTIFICATIONS_READ);
  const [olderDone, setOlderDone] = useState(false);
  const [tab, setTab] = useState<'inbox' | 'todo'>('inbox');
  const unread: number = unreadData?.unreadNotificationCount ?? 0;
  const notices: Notice[] = data?.myNotifications ?? [];

  // Opens on the news if there is any unread, else on what is left to do.
  useEffect(() => {
    if (open) setTab(unread === 0 && reminders.length > 0 ? 'todo' : 'inbox');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setOlderDone(false);
    if (data) refetch(); else load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const setReadLocally = (ids: string[], left: number) => {
    const now = new Date().toISOString();
    for (const id of ids) client.cache.modify({ id: client.cache.identify({ __typename: 'NotificationItem', id }), fields: { readAt: (v) => v ?? now } });
    client.cache.writeQuery({ query: UNREAD_NOTIFICATION_COUNT, data: { unreadNotificationCount: Math.max(0, left) } });
  };
  const openNotice = (n: Notice) => {
    if (!n.readAt) {
      setReadLocally([n.id], unread - 1);
      markRead({ variables: { ids: [n.id] } }).catch(() => undefined);
    }
    setOpen(false);
    if (n.href) router.push(n.href);
  };
  const readAll = async () => {
    await markAll();
    setReadLocally(notices.filter((n) => !n.readAt).map((n) => n.id), 0);
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

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative w-10 h-10 rounded-full border border-slate-200 bg-white text-ink-900 hover:bg-slate-50 flex items-center justify-center">
        <Icon name="bell" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>}
        {unread === 0 && reminders.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-xl z-40 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <p className="text-sm font-semibold text-ink-900">Notifications</p>
            {tab === 'inbox' && unread > 0 && <button type="button" onClick={readAll} className="text-xs font-semibold text-ink-700 hover:underline">Mark all as read</button>}
          </div>
          {markError && <InlineError error={markError} className="px-4 pb-2" />}

          <div role="tablist" className="mx-4 mb-2 flex rounded-xl bg-slate-100 p-0.5">
            {([['inbox', 'News', unread], ['todo', 'To do', reminders.length]] as const).map(([key, label, n]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-[10px] py-1.5 text-xs font-semibold transition-colors ${tab === key ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500 hover:text-ink-900'}`}>
                {label}
                {n > 0 && <span className={`min-w-[18px] rounded-full px-1.5 text-[10px] font-bold ${key === 'inbox' ? 'bg-red-500 text-white' : 'bg-amber-100 text-amber-800'}`}>{n}</span>}
              </button>
            ))}
          </div>

          <div className="max-h-[70vh] overflow-y-auto border-t border-slate-100 px-2 py-2">
            {tab === 'todo' ? (
              reminders.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-slate-500">Nothing to do right now.</p>
              ) : (
                <ul>
                  {reminders.map((n) => (
                    <li key={n.key}>
                      <Link href={n.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50">
                        <span className="w-9 h-9 shrink-0 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Icon name={n.icon} className="w-[18px] h-[18px]" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink-900">{n.title}</span>
                          <span className="block text-xs text-slate-500">{n.detail}</span>
                        </span>
                        <Icon name="arrow" className="w-4 h-4 text-slate-300" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : error ? (
              <InlineError error={error} className="px-2 py-3" />
            ) : loading && notices.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">Loading…</p>
            ) : notices.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">You’re all caught up.</p>
            ) : (
              <ul>
                {notices.map((n) => {
                  const text = notificationText(n.kind, Object.fromEntries(n.params.map((p) => [p.key, p.value])), n.count);
                  return (
                    <li key={n.id}>
                      <button type="button" onClick={() => openNotice(n)} className={`relative w-full flex items-start gap-3 text-left rounded-xl px-3 py-2.5 hover:bg-slate-50 ${n.readAt ? '' : 'bg-slate-50'}`}>
                        <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${n.readAt ? 'bg-slate-100 text-slate-400' : TONE_TILE[text.tone]}`}>
                          <Icon name={KIND_ICON[n.kind] ?? 'bell'} className="w-[18px] h-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${n.readAt ? 'text-slate-600' : 'font-semibold text-ink-900'}`}>{text.title}</span>
                          <span className="block text-xs text-slate-500">{text.body}</span>
                          <span className="block mt-0.5 text-[11px] text-slate-400">{formatDistanceToNowStrict(new Date(n.updatedAt), { addSuffix: true })}</span>
                        </span>
                        {!n.readAt && <span className="mt-2 w-2 h-2 shrink-0 rounded-full bg-red-500"><span className="sr-only">Unread</span></span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {tab === 'inbox' && notices.length >= 20 && !olderDone && (
              <button type="button" onClick={showOlder} className="w-full rounded-xl py-2 text-xs font-semibold text-ink-700 hover:bg-slate-50">Show older</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const { data } = useQuery(MY_PROFILE, { fetchPolicy: 'cache-first' });
  const p = data?.myProfile;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`w-full flex items-center gap-3 pl-1 pr-3 py-1 border transition-colors ${open ? 'bg-white border-slate-200 rounded-t-3xl border-b-transparent' : 'border-transparent rounded-full hover:bg-slate-100'}`}>
        <Avatar first={p?.firstName} last={p?.lastName} />
        <span className="hidden sm:block text-left">
          <span className="block text-sm font-semibold text-ink-900 leading-tight">{p ? `${p.firstName} ${p.lastName}` : ' '}</span>
          {p && <span className="block text-xs text-slate-500">Patient ID: {p.patientNumber}</span>}
        </span>
        <Icon name="chevron" className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full -mt-px w-full min-w-[13rem] bg-white rounded-b-3xl border border-slate-200 shadow-xl z-40 p-1.5 pt-0">
          {[{ href: '/profile', label: 'Profile', icon: 'user' as const }, { href: '/settings', label: 'Settings', icon: 'settings' as const }].map((i) => (
            <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <Icon name={i.icon} className="w-4 h-4" /> {i.label}
            </Link>
          ))}
          <button type="button" onClick={onSignOut} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name="logout" className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ onMenu, onSignOut }: { onMenu: () => void; onSignOut: () => void }) {
  return (
    <header className="flex items-center justify-end gap-3 px-4 sm:px-6 lg:px-8 py-3">
      <button type="button" onClick={onMenu} aria-label="Open menu" className="lg:hidden mr-auto w-10 h-10 rounded-xl border border-slate-200 bg-white text-ink-900 flex items-center justify-center">
        <Icon name="menu" />
      </button>
      <Bell />
      <UserMenu onSignOut={onSignOut} />
    </header>
  );
}

