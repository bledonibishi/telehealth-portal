'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { GET_TICKETS } from '@/graphql/tickets';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { getCurrentUserId } from '@/lib/role';
import { ErrorAlert } from '@/components/ui/Alert';
import { LoadingState } from '@telehealth/loading';
import { sortForDoctor } from './DoctorTicketView';
import { isClosed, replyState, shortHours, type Ticket } from './ticket-meta';

type View = 'REPLY' | 'WAITING' | 'CLOSED';

/** A doctor's list of medical questions: what needs an answer first, late and urgent at the top. One click opens the question. */
export default function DoctorInbox() {
  const { t, timeAgo } = useI18n();
  const me = getCurrentUserId();
  const { data, loading, error } = useQuery(GET_TICKETS, { pollInterval: 30_000 });
  const [view, setView] = useState<View>('REPLY');
  const all: Ticket[] = (data?.supportTickets ?? []).filter((x: Ticket) => x.type === 'CLINICAL');
  const groups: Record<View, Ticket[]> = {
    REPLY: sortForDoctor(all.filter((x) => !isClosed(x.status) && x.status !== 'WAITING_ON_PATIENT')),
    WAITING: all.filter((x) => x.status === 'WAITING_ON_PATIENT').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    CLOSED: all.filter((x) => isClosed(x.status)).sort((a, b) => (b.resolvedAt ?? b.updatedAt).localeCompare(a.resolvedAt ?? a.updatedAt)).slice(0, 50),
  };
  const rows = groups[view];
  const tabs: Array<[View, string]> = [['REPLY', t('Needs your reply')], ['WAITING', t('Waiting for the patient')], ['CLOSED', t('Closed')]];

  return (
    <div className="px-4 sm:px-6 py-5 max-w-4xl mx-auto">
      <div data-guide="page-header" className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">{t('Patient questions')}</h1>
        <p className="text-sm text-gray-500">{t('Medical questions from patients. Late and urgent ones first.')}</p>
      </div>

      <div className="mb-3 flex gap-1 border-b border-gray-200" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === k ? 'border-brand-500 font-medium text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {label}{k !== 'CLOSED' && <span className={`ml-1.5 rounded-full px-1.5 text-xs ${groups[k].length && k === 'REPLY' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{groups[k].length}</span>}
          </button>
        ))}
      </div>

      {error && <ErrorAlert error={error} />}
      {loading && !data ? <LoadingState /> : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-12 text-center text-sm text-gray-500">
          {view === 'REPLY' ? t('Nothing needs your reply. Well done.') : view === 'WAITING' ? t('No questions waiting for a patient’s answer.') : t('No closed questions yet.')}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {rows.map((x) => {
            const rs = replyState(x);
            return (
              <li key={x.id}>
                <Link href={`/tickets/${x.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-purple-50 text-xs font-semibold text-purple-700" aria-hidden>
                    {(x.patientName ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{x.patientName ?? t('Unknown patient')}</span>
                    <span className="block truncate text-sm text-gray-600">{x.subject}</span>
                  </span>
                  <span className="flex flex-shrink-0 flex-col items-end gap-1">
                    {view === 'REPLY' && rs.kind === 'late' && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">{t('Late by {time}', { time: shortHours(rs.hours) })}</span>}
                    {view === 'REPLY' && rs.kind === 'due' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{t('Due in {time}', { time: shortHours(rs.hours) })}</span>}
                    {x.priority === 'URGENT' && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">{t('Urgent')}</span>}
                    <span className="text-xs text-gray-400">{x.assigneeId === me ? `${t('Yours')} · ` : ''}{timeAgo(view === 'REPLY' ? x.createdAt : x.updatedAt)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
