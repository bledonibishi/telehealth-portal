'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import { differenceInYears } from 'date-fns';
import { GET_TICKETS, HAND_TICKET_TO_SUPPORT, REPLY_TO_TICKET, SAVED_REPLIES, TICKET_CONVERSATION, UPDATE_TICKET } from '@/graphql/tickets';
import { GET_PATIENT, PATIENT_ADHERENCE } from '@/graphql/patients';
import { PATIENT_PRESCRIPTIONS } from '@/graphql/consultations';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { getCurrentUserId } from '@/lib/role';
import { InlineError } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { currentMedications } from '@/components/patients/PatientSnapshot';
import MedicationPill from '@/components/patients/MedicationPill';
import TicketConversation from './TicketConversation';
import { isClosed, replyState, shortHours, type Ticket } from './ticket-meta';

/** What a doctor needs beside the question, without opening the record: who, on what, since when, and what to watch for. */
function PatientContext({ patientId }: { patientId: string }) {
  const { t, fmt } = useI18n();
  const { data } = useQuery(GET_PATIENT, { variables: { id: patientId } });
  const { data: rxData } = useQuery(PATIENT_PRESCRIPTIONS, { variables: { patientId } });
  const { data: adherenceData } = useQuery(PATIENT_ADHERENCE, { variables: { patientId, weeks: 4 } });
  const p = data?.patient;
  const prescriptions: any[] = rxData?.patientPrescriptions ?? [];
  const meds = currentMedications(prescriptions);
  const since = prescriptions.length ? new Date(Math.min(...prescriptions.map((r) => new Date(r.issuedAt).getTime()))) : null;
  const flags: Array<{ id: string; description: string; severity: string }> = p?.consultations?.[0]?.redFlags ?? [];
  const weeks: any[] = adherenceData?.doseAdherenceTrend ?? [];
  const due = weeks.reduce((n, w) => n + w.taken + w.missed + w.skipped, 0);
  const taken = weeks.reduce((n, w) => n + w.taken, 0);
  const missed = weeks.reduce((n, w) => n + w.missed, 0);

  if (!p) return <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-base font-semibold text-gray-900">{p.firstName} {p.lastName}</p>
        <p className="text-xs text-gray-500">{t('{n} yrs', { n: differenceInYears(new Date(), new Date(p.dateOfBirth)) })}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {meds.length ? meds.map((m, i) => <MedicationPill key={i} label={m.label} dose={m.dose} />) : <span className="text-sm text-gray-400">{t('Not on a prescription')}</span>}
        </div>
        {since && <p className="mt-2 text-xs text-gray-500">{t('On treatment since {date}', { date: fmt(since, 'd MMM yyyy') })}</p>}
        {due > 0 && (
          <p className={`mt-1 text-xs ${missed > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
            {t('Doses in the last 4 weeks: {taken} of {due} taken', { taken, due })}
          </p>
        )}
        <Link href={`/patients?patient=${patientId}`} className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">{t('Open full record →')}</Link>
      </section>

      {flags.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white">
          <p className="border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Things to know')}</p>
          <ul className="divide-y divide-gray-100">
            {[...flags].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'CRITICAL' ? -1 : 1)).map((f) => (
              <li key={f.id} className="flex items-start gap-2 px-4 py-2">
                <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${f.severity === 'CRITICAL' ? 'bg-red-600' : 'bg-amber-500'}`} aria-label={f.severity === 'CRITICAL' ? t('Critical') : t('Warning')}>!</span>
                <span className={`text-sm ${f.severity === 'CRITICAL' ? 'font-medium text-red-800' : 'text-gray-800'}`}>{f.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * A medical question, as a doctor works it: the conversation and one reply box on the left, the patient beside it, and one
 * click to finish. Status, assignee and the reply clock move by themselves; support and admins keep the full ticket page.
 */
export default function DoctorTicketView({ ticket }: { ticket: Ticket }) {
  const { t, timeAgo } = useI18n();
  const router = useRouter();
  const me = getCurrentUserId();
  const [text, setText] = useState('');
  const [handing, setHanding] = useState(false);
  const [handNote, setHandNote] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const { data: listData } = useQuery(GET_TICKETS, { fetchPolicy: 'cache-first' });
  const { data: repliesData } = useQuery(SAVED_REPLIES, { fetchPolicy: 'cache-first' });
  const saved: { id: string; title: string; body: string }[] = repliesData?.savedReplies ?? [];
  const refresh = [{ query: TICKET_CONVERSATION, variables: { ticketId: ticket.id } }, { query: GET_TICKETS }];
  const [reply, { loading: sending }] = useMutation(REPLY_TO_TICKET, { refetchQueries: refresh, onError: setError });
  const [update, { loading: closing }] = useMutation(UPDATE_TICKET, { refetchQueries: [{ query: GET_TICKETS }], onError: setError });
  const [hand, { loading: handingOver }] = useMutation(HAND_TICKET_TO_SUPPORT, { onError: setError });
  const busy = sending || closing || handingOver;

  // The next question waiting, in the inbox's order, so a doctor can go straight on.
  const queue: Ticket[] = (listData?.supportTickets ?? []).filter((x: Ticket) => x.type === 'CLINICAL' && !isClosed(x.status) && x.status !== 'WAITING_ON_PATIENT' && x.id !== ticket.id);
  const next = sortForDoctor(queue)[0];
  const goNext = () => router.push(next ? `/tickets/${next.id}` : '/tickets');

  const insert = (id: string) => {
    const r = saved.find((x) => x.id === id);
    if (!r) return;
    const first = (ticket.patientName ?? '').trim().split(/\s+/)[0] || t('there');
    const filled = r.body.replace(/\{name\}/g, first);
    setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${filled}` : filled));
  };

  // Answering also takes the ticket, so nobody else picks it up at the same time.
  const send = async (close: boolean) => {
    if (!text.trim() || busy) return;
    setError(null);
    try {
      await reply({ variables: { ticketId: ticket.id, content: text.trim() } });
      await update({ variables: { input: { id: ticket.id, ...(close ? { status: 'RESOLVED' } : {}), ...(ticket.assigneeId ? {} : { assigneeId: me }) } } });
      setText('');
      setDone(close ? t('Sent and closed.') : t('Sent. It comes back here when the patient replies.'));
    } catch { /* shown by onError */ }
  };
  const closeOnly = async () => {
    setError(null);
    try {
      await update({ variables: { input: { id: ticket.id, status: 'RESOLVED' } } });
      setDone(t('Closed without a reply.'));
    } catch { /* shown by onError */ }
  };
  const reopen = async () => {
    setError(null);
    try { await update({ variables: { input: { id: ticket.id, status: 'OPEN' } } }); } catch { /* shown by onError */ }
  };
  const handOver = async () => {
    setError(null);
    try {
      await hand({ variables: { ticketId: ticket.id, note: handNote.trim() } });
      setHanding(false);
      setHandNote('');
      setDone(t('Handed to support. This question stays with you for the medical part.'));
    } catch { /* shown by onError */ }
  };

  const rs = replyState(ticket);
  const closed = isClosed(ticket.status);

  return (
    <div className="px-4 sm:px-6 py-5 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/tickets" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"><span aria-hidden>←</span> {t('Patient questions')}</Link>
        {next && <button type="button" onClick={goNext} className="text-sm font-medium text-brand-600 hover:underline">{t('Skip to next →')}</button>}
      </div>

      <div className="mt-3 mb-5">
        <h1 className="text-xl font-semibold text-gray-900 break-words">{ticket.subject}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span>{t('Asked {when}', { when: timeAgo(ticket.createdAt) })}</span>
          {rs.kind === 'late' && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{t('Reply late by {time}', { time: shortHours(rs.hours) })}</span>}
          {rs.kind === 'due' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{t('Reply due in {time}', { time: shortHours(rs.hours) })}</span>}
          {ticket.priority === 'URGENT' && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">{t('Urgent')}</span>}
          {closed && <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">{t('Closed')}</span>}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
        <section className="rounded-xl border border-gray-200 bg-white p-4 min-w-0">
          <TicketConversation bare ticketId={ticket.id} ticketType={ticket.type} patientName={ticket.patientName} />

          {closed && !done ? (
            // A finished question is read-only. Reopening puts it back in "Needs your reply" before anything can be sent.
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm text-gray-600">{ticket.resolvedAt ? t('This question was closed {when}.', { when: timeAgo(ticket.resolvedAt) }) : t('This question is closed.')}</p>
              <InlineError error={error} />
              <div className="flex items-center gap-3">
                <button type="button" disabled={busy} onClick={reopen} className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{t('Reopen')}</button>
                {next && <button type="button" onClick={goNext} className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-600">{t('Next question →')}</button>}
              </div>
            </div>
          ) : done ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-green-50 px-4 py-3">
              <p className="text-sm font-medium text-green-800">✓ {done}</p>
              <button type="button" onClick={goNext} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
                {next ? t('Next question →') : t('Back to the list')}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {saved.length > 0 && (
                <div className="w-64"><Select size="sm" value="" onChange={insert} ariaLabel={t('Insert a saved reply')} placeholder={t('Insert a saved reply…')} options={saved.map((r) => ({ value: r.id, label: r.title }))} /></div>
              )}
              <textarea
                rows={4}
                value={text}
                maxLength={2000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(e.shiftKey); } }}
                placeholder={t('Write your answer to the patient…')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <InlineError error={error} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy || !text.trim()} onClick={() => send(true)} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">{t('Send and close')}</button>
                <button type="button" disabled={busy || !text.trim()} onClick={() => send(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{t('Send and wait for the patient')}</button>
                <span className="ml-auto flex items-center gap-3 text-sm">
                  <button type="button" disabled={busy} onClick={() => setHanding((h) => !h)} className="text-gray-600 hover:text-gray-900">{t('Hand to support…')}</button>
                  {!closed && <button type="button" disabled={busy} onClick={closeOnly} className="text-gray-500 hover:text-gray-800">{t('Close without reply')}</button>}
                </span>
              </div>
              <p className="text-xs text-gray-400">{t('Ctrl or ⌘ + Enter sends and waits; add Shift to send and close.')}</p>

              {handing && (
                <div className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm text-gray-700">{t('For a delivery, payment or account question. Support gets its own ticket; the medical part stays with you.')}</p>
                  <textarea rows={2} value={handNote} maxLength={1500} onChange={(e) => setHandNote(e.target.value)} placeholder={t('What does the patient need from support?')} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
                  <div className="flex items-center gap-3">
                    <button type="button" disabled={busy || handNote.trim().length < 5} onClick={handOver} className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-50">{t('Hand to support')}</button>
                    <button type="button" onClick={() => setHanding(false)} className="text-sm text-gray-500 hover:text-gray-800">{t('Cancel')}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-4">
          {ticket.patientId ? <PatientContext patientId={ticket.patientId} /> : <p className="text-sm text-gray-400">{t('No patient on this ticket.')}</p>}
        </aside>
      </div>
    </div>
  );
}

/** Late first, then urgent, then whoever has waited longest. Used by the inbox and by "next". */
export function sortForDoctor(list: Ticket[]): Ticket[] {
  const rank = (x: Ticket) => {
    const rs = replyState(x);
    return (rs.kind === 'late' ? 0 : 10) + ({ URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const)[x.priority];
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
}
