'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { ADD_TICKET_NOTE, GET_TICKET_HANDLERS, UPDATE_TICKET } from '@/graphql/tickets';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { getCurrentRole } from '@/lib/role';
import { InlineError } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import QuickFixes from './QuickFixes';
import TicketConversation from './TicketConversation';
import EngineeringHandoff from './EngineeringHandoff';
import { systemNote, systemText } from '@/lib/system-text';
import { PhotoTile } from '@/components/PhotoTile';
import { filePath, openAuthedFile } from '@/lib/files';
import {
  isClosed, replyState, shortHours, PRIORITY_CLS, PRIORITY_LABEL, STATUS_CLS, STATUS_LABEL, TYPE_CLS, TYPE_LABEL,
  type Ticket, type TicketPriority, type TicketStatus, type TicketType,
} from './ticket-meta';

const entries = <T extends string>(labels: Record<T, string>) => Object.keys(labels) as T[];
const card = 'bg-white rounded-xl border border-gray-200';
const sectionTitle = 'text-xs font-semibold text-gray-500 uppercase tracking-wide';

/** One ticket as a page: what was asked and what has happened on the left, who has it and what can be done on the right. */
export default function TicketDetail({ ticket }: { ticket: Ticket }) {
  const { t, fmt, timeAgo } = useI18n();
  const role = getCurrentRole();
  const clinical = ticket.type === 'CLINICAL';
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState('');

  const { data: handlerData } = useQuery(GET_TICKET_HANDLERS, { variables: { clinical } });
  const handlers: { id: string; name: string }[] = handlerData?.ticketHandlers ?? [];

  const [update, { loading: saving }] = useMutation(UPDATE_TICKET, { onError: setError, onCompleted: () => setError(null) });
  const [addNote, { loading: noting }] = useMutation(ADD_TICKET_NOTE, { onError: setError, onCompleted: () => { setError(null); setNote(''); } });
  const change = (patch: Record<string, unknown>) => update({ variables: { input: { id: ticket.id, ...patch } } });

  // The server enforces these too; hiding them here just saves a refused click.
  const supportOnClinical = role === 'CX_TEAM' && clinical;
  const statuses = entries(STATUS_LABEL).filter((s) => !(supportOnClinical && isClosed(s)));
  const types = entries(TYPE_LABEL).filter((ty) => !(role === 'DOCTOR' && ty !== 'CLINICAL') && !(role === 'CX_TEAM' && clinical && ty !== 'CLINICAL'));
  const canHandOff = role === 'CX_TEAM' || role === 'ADMIN';
  const canQuickFix = !!ticket.patientId && (role === 'CX_TEAM' || role === 'ADMIN');
  const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="px-4 sm:px-6 py-5 max-w-6xl mx-auto">
      <Link href="/tickets" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <span aria-hidden>←</span> {t('All tickets')}
      </Link>

      <div className="mt-3 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400">{t('Ticket')} #{ticket.number}</p>
          <h1 className="text-xl font-semibold text-gray-900 break-words">{ticket.subject}</h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_CLS[ticket.status]}`}>{t(STATUS_LABEL[ticket.status])}</span>
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${TYPE_CLS[ticket.type]}`}>{t(TYPE_LABEL[ticket.type])}</span>
            <span className={`text-xs ${PRIORITY_CLS[ticket.priority]}`}>{t(PRIORITY_LABEL[ticket.priority])} {t('priority')}</span>
          </div>
        </div>
        {ticket.patientId && (
          <div className="flex items-center gap-2">
            <Link href={`/patients?patient=${ticket.patientId}`} className="text-sm font-medium border border-gray-300 text-gray-700 bg-white rounded-lg px-3.5 py-1.5 hover:bg-gray-50">{t('Open patient')}</Link>
            <Link href={`/patients?patient=${ticket.patientId}&tab=messages`} className="text-sm font-medium bg-brand-500 text-white rounded-lg px-3.5 py-1.5 hover:bg-brand-600">{t('Reply in messages')}</Link>
          </div>
        )}
      </div>

      <InlineError error={error} className="mb-4" />

      {(canHandOff || ticket.engineeringSentAt) && <div className="mb-4"><EngineeringHandoff ticket={ticket} readOnly={!canHandOff} /></div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="space-y-5 min-w-0">
          <section className={`${card} p-5`}>
            <h2 className={`${sectionTitle} mb-2`}>{t('What was asked')}</h2>
            {ticket.description ? <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{systemText(ticket.description, t)}</p> : <p className="text-sm text-gray-400">{t('No description.')}</p>}
            {ticket.attachments.length > 0 && (
              <div className="mt-4">
                <p className={`${sectionTitle} mb-2`}>{t('Attached by the patient')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {ticket.attachments.map((a) =>
                    a.mimeType.startsWith('image/') ? (
                      <PhotoTile key={a.id} path={filePath(a.id)} caption={a.filename} height="h-40" />
                    ) : (
                      <button key={a.id} type="button" onClick={() => openAuthedFile(filePath(a.id)).catch(setError)} className="h-40 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 flex flex-col items-center justify-center gap-1 px-3 text-center">
                        <span className="text-xs font-semibold text-gray-500">PDF</span>
                        <span className="text-sm text-gray-800 break-all line-clamp-2">{a.filename}</span>
                        <span className="text-xs text-brand-500">{t('Open')}</span>
                      </button>
                    ),
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">{t('Each time a file is opened, it is recorded in the audit log.')}</p>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3">{t('Opened')} {fmt(ticket.createdAt, 'd MMM yyyy, HH:mm')} · {timeAgo(ticket.createdAt)}</p>
          </section>

          {ticket.patientId && (
            <section className={`${card} p-5`}>
              <TicketConversation ticketId={ticket.id} ticketType={ticket.type} patientName={ticket.patientName} />
            </section>
          )}

          {canQuickFix && (
            <section className={`${card} p-5`}>
              <QuickFixes ticketId={ticket.id} patientId={ticket.patientId!} ticketType={ticket.type} />
              {/* Changing their home screen is rarely what a ticket is about, so it is a link to the patient's own tab, not a panel here. */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
                <p className="text-sm text-gray-500">{t('Ticket about a missing card on their home screen?')}</p>
                <Link href={`/patients?patient=${ticket.patientId}&tab=homescreen`} className="text-sm font-medium text-brand-600 hover:underline">{t('Change their home screen →')}</Link>
              </div>
            </section>
          )}

          <section className={`${card} p-5`}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h2 className={sectionTitle}>{t('Activity and notes')}</h2>
              <span className="text-xs text-gray-400">{t('Only the team sees these.')}</span>
            </div>
            {ticket.notes.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">{t('No notes yet.')}</p>
            ) : (
              <ol className="mt-3 space-y-4">
                {ticket.notes.map((n) => {
                  const assistant = n.authorName === 'Automated assistant';
                  return (
                    <li key={n.id} className="flex gap-3">
                      <span className={`mt-0.5 w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${assistant ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-600'}`} aria-hidden>
                        {assistant ? 'AI' : initial(n.authorName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500"><span className="font-medium text-gray-800">{assistant ? t('Automated assistant') : n.authorName}</span> · {timeAgo(n.createdAt)}</p>
                        <div className={`mt-1 rounded-lg px-3.5 py-2.5 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed ${assistant || n.body.startsWith('Passed to the engineers') ? 'bg-violet-50/60' : 'bg-gray-50'}`}>{systemNote(n.body, t)}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <form
              className="mt-5 pt-4 border-t border-gray-100 space-y-2"
              onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote({ variables: { ticketId: ticket.id, body: note.trim() } }); }}
            >
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Add a note for the team…')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-400">{t('These notes are not sent to the patient.')}</p>
                <button type="submit" disabled={noting || !note.trim()} className="bg-brand-500 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">{noting ? t('Saving…') : t('Add note')}</button>
              </div>
            </form>
          </section>

        </div>

        <aside className="space-y-5 min-w-0">
          <section className={`${card} p-5 space-y-3`}>
            <h2 className={sectionTitle}>{t('Details')}</h2>
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1">{t('Status')}</span>
              <Select value={ticket.status} disabled={saving} ariaLabel={t('Status')} onChange={(v) => change({ status: v as TicketStatus })} options={statuses.map((s) => ({ value: s, label: t(STATUS_LABEL[s]) }))} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1">{t('Priority')}</span>
              <Select value={ticket.priority} disabled={saving} ariaLabel={t('Priority')} onChange={(v) => change({ priority: v as TicketPriority })} options={entries(PRIORITY_LABEL).map((p) => ({ value: p, label: t(PRIORITY_LABEL[p]) }))} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1">{t('Type')}</span>
              <Select value={ticket.type} disabled={saving || types.length < 2} ariaLabel={t('Type')} onChange={(v) => change({ type: v as TicketType })} options={types.map((ty) => ({ value: ty, label: t(TYPE_LABEL[ty]) }))} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1">{t('Assigned to')}</span>
              <Select value={ticket.assigneeId ?? ''} disabled={saving} ariaLabel={t('Assigned to')} onChange={(v) => change({ assigneeId: v })} options={[{ value: '', label: t('Nobody yet') }, ...handlers.map((h) => ({ value: h.id, label: h.name }))]} />
            </label>
            {clinical && <p className="text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-2">{t('This one is for the doctors. Only a doctor can close it or move it to another type.')}</p>}
          </section>

          <section className={`${card} p-5`}>
            <h2 className={`${sectionTitle} mb-3`}>{t('Timing')}</h2>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('Opened')}</dt><dd className="text-gray-900 text-right">{fmt(ticket.createdAt, 'd MMM yyyy, HH:mm')}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('First reply')}</dt><dd className="text-gray-900 text-right">{ticket.firstResponseAt ? timeAgo(ticket.firstResponseAt) : t('Not yet')}</dd></div>
              {(() => {
                const r = replyState(ticket);
                if (r.kind === 'late') return <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('Reply was due')}</dt><dd className="text-danger-500 font-medium text-right">{t('Late by {time}', { time: shortHours(r.hours) })}</dd></div>;
                if (r.kind === 'due') return <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('Reply due')}</dt><dd className="text-gray-900 text-right">{t('in {time}', { time: shortHours(r.hours) })}</dd></div>;
                return null;
              })()}
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('Resolved')}</dt><dd className="text-gray-900 text-right">{ticket.resolvedAt ? fmt(ticket.resolvedAt, 'd MMM yyyy, HH:mm') : '—'}</dd></div>
            </dl>
          </section>

        </aside>
      </div>
    </div>
  );
}
