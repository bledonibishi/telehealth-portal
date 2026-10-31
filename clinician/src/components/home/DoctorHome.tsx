'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { GET_NOTIFICATION_COUNTS } from '@/graphql/notifications';
import { QUEUE_PREVIEW } from '@/graphql/consultations';
import { APPOINTMENT_REQUESTS } from '@/graphql/appointments';
import { getCurrentUserId } from '@/lib/role';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { RiskBadge } from '@/components/consultation/RiskBadge';
import { InlineError } from '@/components/ui/Alert';
import { SkeletonStat } from '@telehealth/loading';
import { ActionTile } from './ActionTile';

type Counts = Record<string, number>;
type QueueItem = { id: string; kind: string; status: string; submittedAt: string | null; riskTag: string | null; patient: { id: string; firstName: string; lastName: string }; clinician: { id: string } | null; redFlags: Array<{ id: string; severity: string }> };
type Appointment = { id: string; patientId: string; patientName: string; reason: string; urgency: 'URGENT' | 'ROUTINE'; status: string; respondBy: string | null; overdue: boolean; scheduledFor: string | null; clinicianName: string | null };

// Most urgent first: safety, then decisions patients are waiting on, then the rest of the day's work.
const WORK: Array<{ key: string; label: string; sub: string; href: string; tone: 'red' | 'amber' }> = [
  { key: 'urgentAppointments', label: 'Urgent appointment requests', sub: 'To answer within 24 hours', href: '/appointments', tone: 'red' },
  { key: 'sideEffectAlerts', label: 'Side effects reported', sub: 'Not yet acknowledged by a doctor', href: '/check-ins', tone: 'red' },
  { key: 'pendingConsultations', label: 'Consultations to review', sub: 'Patients waiting for a decision', href: '/queue', tone: 'amber' },
  { key: 'missedDoseAlerts', label: 'Missed doses', sub: 'GLP-1 patients who missed several in a row', href: '/check-ins', tone: 'amber' },
  { key: 'patientMessages', label: 'Patient messages', sub: 'With no reply yet', href: '/patients', tone: 'amber' },
  { key: 'ticketsToDo', label: 'Patient questions', sub: 'Medical questions to answer', href: '/tickets', tone: 'amber' },
  { key: 'shipmentsDue', label: 'Next supplies due', sub: 'Repeats to approve or late', href: '/shipments', tone: 'amber' },
];

function Panel({ title, href, action, children }: { title: string; href: string; action: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white min-w-0">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <Link href={href} className="text-xs font-medium text-brand-600 hover:underline">{action}</Link>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-gray-400">{children}</p>;
}

/** A doctor's start page: what is waiting for them, the oldest cases in the queue, and their appointments. */
export default function DoctorHome() {
  const { t, fmt, timeAgo } = useI18n();
  const me = getCurrentUserId();
  const { data: countData, loading: countsLoading } = useQuery(GET_NOTIFICATION_COUNTS, { pollInterval: 30_000 });
  const queue = useQuery(QUEUE_PREVIEW, { pollInterval: 60_000, fetchPolicy: 'cache-and-network' });
  const appts = useQuery(APPOINTMENT_REQUESTS, { pollInterval: 60_000, fetchPolicy: 'cache-and-network' });
  const counts: Counts | undefined = countData?.notificationCounts;

  // Oldest first: the patient who has waited longest is seen first.
  const waiting: QueueItem[] = [...(queue.data?.consultationQueue ?? [])]
    .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))
    .slice(0, 6);
  const all: Appointment[] = appts.data?.appointmentRequests ?? [];
  const toAnswer = all.filter((a) => a.status === 'REQUESTED').sort((a, b) => (a.urgency === b.urgency ? (a.respondBy ?? '').localeCompare(b.respondBy ?? '') : a.urgency === 'URGENT' ? -1 : 1));
  const upcoming = all.filter((a) => a.status === 'SCHEDULED' && a.scheduledFor && new Date(a.scheduledFor).getTime() > Date.now() - 3_600_000)
    .sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl">
      <div data-guide="page-header">
        <h1 className="text-2xl font-semibold text-gray-900">{t('Good morning')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{fmt(new Date(), 'PPPP')}</p>
      </div>

      <section data-guide="dashboard:work">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Waiting for you')}</h2>
        {countsLoading && !counts ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{[1, 2, 3, 4].map((k) => <SkeletonStat key={k} />)}</div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {WORK.map((w) => <ActionTile key={w.key} label={w.label} sub={w.sub} href={w.href} tone={w.tone} value={counts?.[w.key] ?? 0} />)}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Panel title={t('Waiting longest in the review queue')} href="/queue" action={t('Open the queue →')}>
          <InlineError error={queue.error} className="m-4" />
          {queue.loading && !waiting.length ? <Empty>{t('Loading…')}</Empty> : waiting.length === 0 ? (
            <Empty>{t('The queue is empty. Nobody is waiting for a decision.')}</Empty>
          ) : (
            <ul className="divide-y divide-gray-100">
              {waiting.map((c) => {
                const critical = c.redFlags.some((f) => f.severity === 'CRITICAL');
                const mine = c.clinician?.id === me;
                return (
                  <li key={c.id}>
                    <Link href={`/consultation/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700" aria-hidden>
                        {`${c.patient.firstName[0] ?? ''}${c.patient.lastName[0] ?? ''}`.toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">{c.patient.firstName} {c.patient.lastName}</span>
                        <span className="block text-xs text-gray-500">
                          {c.submittedAt ? t('Submitted {when}', { when: timeAgo(c.submittedAt) }) : t('Not submitted yet')}
                          {mine ? ` · ${t('Claimed by you')}` : c.clinician ? ` · ${t('Claimed by a colleague')}` : ''}
                        </span>
                      </span>
                      {c.redFlags.length > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${critical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{c.redFlags.length === 1 ? t('1 red flag') : t('{n} red flags', { n: c.redFlags.length })}</span>}
                      <RiskBadge tag={c.riskTag} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={t('Appointments')} href="/appointments" action={t('All appointments →')}>
          <InlineError error={appts.error} className="m-4" />
          {appts.loading && !all.length ? <Empty>{t('Loading…')}</Empty> : toAnswer.length + upcoming.length === 0 ? (
            <Empty>{t('No appointment requests and nothing booked.')}</Empty>
          ) : (
            <div className="divide-y divide-gray-100">
              {toAnswer.length > 0 && (
                <div className="px-5 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('To answer')}</p>
                  <ul className="space-y-2">
                    {toAnswer.slice(0, 4).map((a) => (
                      <li key={a.id}>
                        <Link href="/appointments" className="flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-gray-50">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.urgency === 'URGENT' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                            {a.urgency === 'URGENT' ? t('Urgent') : t('Routine')}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{a.patientName}</span>
                          {a.respondBy && (
                            <span className={`text-xs ${a.overdue ? 'font-semibold text-red-700' : 'text-gray-500'}`}>
                              {a.overdue ? t('Overdue') : t('Answer by {time}', { time: fmt(a.respondBy, 'EEE HH:mm') })}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {upcoming.length > 0 && (
                <div className="px-5 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Booked')}</p>
                  <ul className="space-y-2">
                    {upcoming.slice(0, 5).map((a) => (
                      <li key={a.id} className="flex items-center gap-3">
                        <span className="w-24 flex-shrink-0 text-xs font-semibold tabular-nums text-gray-900">{fmt(a.scheduledFor!, 'EEE HH:mm')}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{a.patientName}</span>
                        {a.clinicianName && <span className="truncate text-xs text-gray-500">{a.clinicianName}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
