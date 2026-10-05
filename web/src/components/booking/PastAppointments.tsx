'use client';

import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_PAST_BOOKINGS, type Booking } from '@telehealth/booking';
import { Card, CardHeader } from '@/components/portal/Card';

const STATUS: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: 'Completed', cls: 'bg-ink-50 text-ink-700' },
  CONFIRMED: { label: 'Completed', cls: 'bg-ink-50 text-ink-700' }, // confirmed and already over
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' },
  REJECTED: { label: 'Declined', cls: 'bg-slate-100 text-slate-500' },
  PENDING: { label: 'Not confirmed', cls: 'bg-slate-100 text-slate-500' },
};

/** Appointments that are over or were given up, newest first. Hidden until there is one. */
export function PastAppointments() {
  const { data } = useQuery(MY_PAST_BOOKINGS, { fetchPolicy: 'cache-and-network' });
  const list: Booking[] = data?.myPastBookings ?? [];
  if (!list.length) return null;
  return (
    <Card labelledBy="past-title">
      <CardHeader id="past-title" title="Past appointments" />
      <ul className="divide-y divide-slate-100">
        {list.map((b) => (
          <li key={b.uid} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-900">{format(new Date(b.startsAt), 'EEE d MMM yyyy · HH:mm')}</p>
              <p className="text-xs text-slate-500 truncate">{b.title ?? 'Appointment'}{b.hostName ? ` · with ${b.hostName}` : ''}</p>
              {b.cancelReason && <p className="text-xs text-slate-400">Reason: {b.cancelReason}</p>}
            </div>
            <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS[b.status]?.cls ?? 'bg-slate-100 text-slate-500'}`}>{STATUS[b.status]?.label ?? b.status}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
