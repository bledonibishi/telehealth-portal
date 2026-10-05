'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { format, isToday, isTomorrow } from 'date-fns';
import { MY_PROFILE, MY_PRESCRIPTION_HISTORY } from '@/graphql/portal';
import { MY_ORDERS } from '@/graphql/orders';
import { MY_SUPPLY_STATUS } from '@/graphql/supply';
import { MY_BOOKINGS } from '@telehealth/booking';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';
import { MY_DOSE_SUMMARY } from '@/graphql/dosing';
import { useUnreadMessages } from '@/lib/useUnreadMessages';
import { Avatar, Icon } from './Icon';

type Note = { key: string; title: string; detail: string; href: string };

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

/**
 * What needs the patient's attention, built from their own data: new replies, an appointment coming up, a dose
 * or check-in that is due, an order on its way, a supply to order, a prescription just approved or running out.
 */
const DAY = 86_400_000;

function useNotes(): Note[] {
  const { unread } = useUnreadMessages();
  const { data: booked } = useQuery(MY_BOOKINGS, { fetchPolicy: 'cache-first', pollInterval: 120_000 });
  const { data: journey } = useQuery(MY_WEIGHT_JOURNEY, { fetchPolicy: 'cache-first' });
  const { data: dose } = useQuery(MY_DOSE_SUMMARY, { fetchPolicy: 'cache-first' });
  const { data: orders } = useQuery(MY_ORDERS, { fetchPolicy: 'cache-first' });
  const { data: supply } = useQuery(MY_SUPPLY_STATUS, { fetchPolicy: 'cache-first' });
  const { data: rx } = useQuery(MY_PRESCRIPTION_HISTORY, { fetchPolicy: 'cache-first' });
  const now = Date.now();
  const notes: Note[] = [];

  if (unread) notes.push({ key: 'msg', title: unread === 1 ? 'New message from your care team' : `${unread} new messages from your care team`, detail: 'Open the chat to read it', href: '/messages' });

  // An appointment in the next two days.
  for (const b of (booked?.myBookings ?? []) as any[]) {
    const at = Date.parse(b.startsAt);
    if (at > now && at - now < 2 * DAY) {
      const d = new Date(at);
      notes.push({ key: `appt-${b.uid}`, title: 'Appointment coming up', detail: `${isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEE d MMM')} at ${format(d, 'HH:mm')}`, href: '/appointments' });
    }
  }

  const next = dose?.myDoseSummary?.nextDoseAt;
  if (next && Date.parse(next) < now + DAY) {
    notes.push({ key: 'dose', title: Date.parse(next) < now - DAY ? 'An injection is overdue' : 'Injection due today', detail: dose.myDoseSummary.current, href: '/doses' });
  }
  if (journey?.myWeightJourney?.checkInState === 'READY') notes.push({ key: 'checkin', title: 'Monthly check-in is ready', detail: 'Your doctor reviews it before your next supply', href: journey.myWeightJourney.checkInUrl ?? '/dashboard' });

  // A supply sent in the last few days and not yet delivered.
  const order = ((orders?.myOrders ?? []) as any[]).find((o) => (o.status === 'DISPATCHED' || o.status === 'OUT_FOR_DELIVERY') && o.dispatchedAt && now - Date.parse(o.dispatchedAt) < 7 * DAY);
  if (order) notes.push({ key: `order-${order.id}`, title: order.status === 'OUT_FOR_DELIVERY' ? 'Your order is out for delivery' : 'Your order has shipped', detail: order.prescription?.medication ?? 'Track it under Orders', href: '/orders' });

  if (supply?.mySupplyStatus?.refillState === 'READY') notes.push({ key: 'refill', title: 'Time to order your next supply', detail: 'Your doctor approves it first', href: '/treatment-plan' });

  const active = ((rx?.myPrescriptions ?? []) as any[]).find((p) => p.status === 'ACTIVE');
  if (active) {
    if (now - Date.parse(active.issuedAt) < 3 * DAY) notes.push({ key: `rx-new-${active.id}`, title: 'Prescription approved', detail: `${active.medication} ${active.dosage}`.trim(), href: '/prescription' });
    if (active.validUntil && Date.parse(active.validUntil) - now < 14 * DAY && Date.parse(active.validUntil) > now) {
      notes.push({ key: `rx-exp-${active.id}`, title: 'Your prescription runs out soon', detail: `On ${format(new Date(active.validUntil), 'd MMM')} — your doctor renews it at your check-in`, href: '/treatment-plan' });
    }
  }
  return notes;
}

function Bell() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const notes = useNotes();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Notifications${notes.length ? `, ${notes.length} new` : ''}`}
        className="relative w-10 h-10 rounded-full border border-slate-200 bg-white text-ink-900 hover:bg-slate-50 flex items-center justify-center">
        <Icon name="bell" />
        {notes.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{notes.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-xl z-40 p-2">
          <p className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Notifications</p>
          {notes.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-slate-500">You’re all caught up.</p>
          ) : (
            <ul>
              {notes.map((n) => (
                <li key={n.key}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 hover:bg-slate-50">
                    <p className="text-sm font-medium text-ink-900">{n.title}</p>
                    <p className="text-xs text-slate-500">{n.detail}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
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
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-3 rounded-full pl-1 pr-2 py-1 hover:bg-slate-100">
        <Avatar first={p?.firstName} last={p?.lastName} />
        <span className="hidden sm:block text-left">
          <span className="block text-sm font-semibold text-ink-900 leading-tight">{p ? `${p.firstName} ${p.lastName}` : ' '}</span>
          {p && <span className="block text-xs text-slate-500">Patient ID: {p.patientNumber}</span>}
        </span>
        <Icon name="chevron" className="w-4 h-4 text-slate-500" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl border border-slate-200 shadow-xl z-40 p-1.5">
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

