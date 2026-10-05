'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { STAFF_BOOKINGS } from '@telehealth/booking';
import { useI18n } from '@/lib/i18n/I18nProvider';

/** What is booked with the clinic over the next two weeks, from the booking system (mirrored from Cal.com). */
export default function Diary() {
  const { t, fmt } = useI18n();
  const { data, error } = useQuery(STAFF_BOOKINGS, { pollInterval: 60_000 });
  const list: any[] = data?.bookings ?? [];
  if (error || !list.length) return null; // nothing booked, or scheduling isn't in use: the requests below are the whole picture

  return (
    <section className="border-b border-gray-200 bg-white">
      <h2 className="px-6 pt-4 text-sm font-semibold text-gray-900">{t('Diary — next 14 days')}</h2>
      <ul className="px-6 py-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((b) => (
          <li key={b.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <p className="font-medium text-gray-900">
              {fmt(b.startsAt, 'EEE dd MMM, HH:mm')}
              {b.status === 'PENDING' && <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{t('Needs confirming')}</span>}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {b.patientId ? <Link href={`/patients?patient=${b.patientId}`} className="text-brand-500 hover:underline">{b.attendeeName ?? b.attendeeEmail}</Link> : <>{b.attendeeName ?? b.attendeeEmail} · {t('booked outside the portal')}</>}
              {b.hostName ? ` · ${b.hostName}` : ''}
            </p>
            {b.meetingUrl && <a href={b.meetingUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-500 hover:underline">{t('Join video call')}</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}
