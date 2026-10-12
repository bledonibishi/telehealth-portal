'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { APPOINTMENT_REQUESTS, CANCEL_APPOINTMENT, COMPLETE_APPOINTMENT, SCHEDULE_APPOINTMENT } from '@/graphql/appointments';
import { GET_NOTIFICATION_COUNTS } from '@/graphql/notifications';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';
import { SkeletonList } from '@telehealth/loading';

const REASON: Record<string, string> = {
  QUESTION: 'Question', CHECK_UP: 'Check-up', SIDE_EFFECT: 'Side effect', PAIN: 'Pain', DOSE_CHANGE: 'Dose change', OTHER: 'Other',
};
// Same keys as RED_FLAGS in backend/src/appointments/triage.ts.
const RED_FLAG: Record<string, string> = {
  chest_pain: 'Chest pain or tightness',
  breathing: 'Trouble breathing',
  fainting: 'Fainting or confusion',
  severe_abdominal_pain: 'Severe stomach pain that spreads to the back',
  cannot_keep_fluids: 'Can’t keep any fluids down',
  allergic_reaction: 'Swelling of the face, lips or throat',
  leg_swelling: 'A painful, swollen leg',
  stroke_signs: 'Face drooping, arm weakness or slurred speech',
};

const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900';

/** Book a time, close it, or turn it down with a reason the patient sees. */
function Actions({ a }: { a: any }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'schedule' | 'cancel' | null>(null);
  const [when, setWhen] = useState('');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const refetch = { refetchQueries: [{ query: APPOINTMENT_REQUESTS }, { query: GET_NOTIFICATION_COUNTS }] };
  const [schedule, s] = useMutation(SCHEDULE_APPOINTMENT, refetch);
  const [complete, c] = useMutation(COMPLETE_APPOINTMENT, refetch);
  const [cancel, x] = useMutation(CANCEL_APPOINTMENT, refetch);
  const error = s.error ?? c.error ?? x.error;
  const busy = s.loading || c.loading || x.loading;

  const book = (e: React.FormEvent) => {
    e.preventDefault();
    if (!when) return;
    schedule({ variables: { input: { id: a.id, scheduledFor: new Date(when).toISOString(), meetingUrl: link.trim() || undefined, note: note.trim() || undefined } } })
      .then(() => setMode(null)).catch(() => undefined);
  };
  const decline = (e: React.FormEvent) => {
    e.preventDefault();
    cancel({ variables: { id: a.id, note } }).then(() => setMode(null)).catch(() => undefined);
  };

  return (
    <div className="mt-3">
      {mode === null && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button onClick={() => setMode('schedule')} className="px-3 py-1.5 rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600">{a.status === 'SCHEDULED' ? t('Reschedule') : t('Book a time')}</button>
          {a.status === 'SCHEDULED' && (
            <button disabled={busy} onClick={() => complete({ variables: { id: a.id } }).catch(() => undefined)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">{t('Mark as done')}</button>
          )}
          <button onClick={() => setMode('cancel')} className="text-gray-500 hover:text-red-600">{t('Turn down')}</button>
          <Link href={`/patients?patient=${a.patientId}`} className="text-brand-500 hover:text-brand-900">{t('Open patient')}</Link>
        </div>
      )}
      {mode === 'schedule' && (
        <form onSubmit={book} className="grid sm:grid-cols-3 gap-2 max-w-3xl">
          <input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className={input} aria-label={t('Date and time')} />
          <input type="url" placeholder={t('Video link (https://…, optional)')} value={link} onChange={(e) => setLink(e.target.value)} className={input} />
          <input placeholder={t('Note for the patient (optional)')} value={note} onChange={(e) => setNote(e.target.value)} className={input} />
          <div className="sm:col-span-3 flex gap-3">
            <button disabled={busy} className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-medium disabled:opacity-50">{busy ? t('Saving…') : t('Book and email the patient')}</button>
            <button type="button" onClick={() => setMode(null)} className="text-sm text-gray-500">{t('Cancel')}</button>
          </div>
        </form>
      )}
      {mode === 'cancel' && (
        <form onSubmit={decline} className="flex flex-wrap gap-2 max-w-2xl">
          <input required placeholder={t('Why? The patient sees this, e.g. “Answered in messages”')} value={note} onChange={(e) => setNote(e.target.value)} className={`${input} flex-1 min-w-[16rem]`} />
          <button disabled={busy} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50">{t('Turn down')}</button>
          <button type="button" onClick={() => setMode(null)} className="text-sm text-gray-500">{t('Cancel')}</button>
        </form>
      )}
      <InlineError error={error} size="xs" className="mt-2" />
    </div>
  );
}

/**
 * Patients asking to see a doctor, urgent first. Urgent requests (warning signs, pain of 7+, or "it can't
 * wait") must be answered within 24 hours, the rest within 3 days; anything past its time is marked overdue.
 */
export default function AppointmentRequests() {
  const { t, fmt } = useI18n();
  const { data, loading, error } = useQuery(APPOINTMENT_REQUESTS, { pollInterval: 60_000 });
  const list: any[] = data?.appointmentRequests ?? [];

  return (
    <div>
      {loading && <div className="p-6"><SkeletonList rows={3} label={t('Loading…')} /></div>}
      <InlineError error={error} className="p-6" />
      {!loading && !list.length && <div className="p-12 text-center text-gray-400 text-sm">{t('No appointment requests waiting.')}</div>}
      <ul className="divide-y divide-gray-100">
        {list.map((a) => (
          <li key={a.id} className={`px-4 sm:px-6 py-4 bg-white ${a.urgency === 'URGENT' && a.status === 'REQUESTED' ? 'border-l-4 border-red-500' : ''}`}>
            <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
              <div className="min-w-[240px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/patients?patient=${a.patientId}`} className="font-medium text-gray-900 hover:underline">{a.patientName}</Link>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${a.urgency === 'URGENT' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{a.urgency === 'URGENT' ? t('Urgent · 24h') : t('Routine · 3 days')}</span>
                  <span className="text-xs text-gray-500">{t(REASON[a.reason] ?? a.reason)}</span>
                  {a.status === 'SCHEDULED' && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">{t('Booked')}</span>}
                  {a.overdue && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-600 text-white">{t('Overdue')}</span>}
                </div>
                {a.details && <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap">{a.details}</p>}
                {a.painLevel != null && <p className="text-xs text-gray-500 mt-1">{t('Pain {n}/10', { n: a.painLevel })}</p>}
                {a.redFlags.length > 0 && (
                  <p className="text-xs font-medium text-red-700 mt-1">⚠ {a.redFlags.map((f: string) => t(RED_FLAG[f] ?? f)).join(' · ')} — {t('patient was told to call emergency services')}</p>
                )}
                {a.preferredTimes && <p className="text-xs text-gray-500 mt-1">{t('Prefers: {times}', { times: a.preferredTimes })}</p>}
              </div>
              <div className="text-xs text-gray-500 min-w-[180px]">
                <p>{t('Asked {date}', { date: fmt(a.createdAt, 'dd MMM, HH:mm') })}</p>
                {a.status === 'REQUESTED' && <p className={a.overdue ? 'text-red-700 font-medium' : ''}>{t('Reply by {date}', { date: fmt(a.respondBy, 'dd MMM, HH:mm') })}</p>}
                {a.scheduledFor && <p className="font-medium text-gray-800">{t('Booked for {date}', { date: fmt(a.scheduledFor, 'dd MMM, HH:mm') })}{a.clinicianName ? ` · ${a.clinicianName}` : ''}</p>}
              </div>
            </div>
            <Actions a={a} />
          </li>
        ))}
      </ul>
    </div>
  );
}
