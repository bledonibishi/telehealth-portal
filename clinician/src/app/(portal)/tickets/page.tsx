'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type PaginationState, type SortingState } from '@tanstack/react-table';
import { GET_TICKETS } from '@/graphql/tickets';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { getCurrentRole, getCurrentUserId } from '@/lib/role';
import { ErrorAlert } from '@/components/ui/Alert';
import { DataRows, SortableTh, tableDefaults, useTablePager } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { LoadingState } from '@telehealth/loading';
import NewTicketDialog from '@/components/tickets/NewTicketDialog';
import SavedRepliesDialog from '@/components/tickets/SavedRepliesDialog';
import DoctorInbox from '@/components/tickets/DoctorInbox';
import {
  isClosed, withEngineering, replyState, shortHours, PRIORITY_CLS, PRIORITY_LABEL, STATUS_CLS, STATUS_LABEL, TYPE_CLS, TYPE_LABEL,
  type Ticket, type TicketPriority, type TicketStatus, type TicketType,
} from '@/components/tickets/ticket-meta';

type View = 'ACTIVE' | 'MINE' | 'ENGINEERING' | 'RESOLVED';

// Sorting by priority or status follows how urgent it is, not the alphabet.
const PRIORITY_RANK: Record<TicketPriority, number> = { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 };
const STATUS_RANK: Record<TicketStatus, number> = { OPEN: 0, IN_PROGRESS: 1, WAITING_ON_PATIENT: 2, RESOLVED: 3, CLOSED: 4 };

/** Doctors get their own inbox of medical questions; support and admins the full ticket list. */
export default function TicketsPage() {
  return getCurrentRole() === 'DOCTOR' ? <DoctorInbox /> : <TicketsList />;
}

function TicketsList() {
  const { t, timeAgo } = useI18n();
  const router = useRouter();
  const { data, loading, error } = useQuery(GET_TICKETS, { pollInterval: 30_000 });
  const [view, setView] = useState<View>('ACTIVE');
  const [type, setType] = useState<TicketType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [managingReplies, setManagingReplies] = useState(false);
  const canEditReplies = ['ADMIN', 'CX_TEAM'].includes(getCurrentRole() ?? '');
  // Oldest first to begin with: the one that has waited longest is at the top.
  const [sorting, setSorting] = useState<SortingState>([{ id: 'opened', desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const all: Ticket[] = data?.supportTickets ?? [];
  const myId = useMemo(() => getCurrentUserId(), []);
  const active = all.filter((x) => !isClosed(x.status));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, '');
    return all.filter((x) => {
      if (type !== 'ALL' && x.type !== type) return false;
      if (view === 'ENGINEERING') { if (!withEngineering(x)) return false; }
      else if (view === 'RESOLVED' ? !isClosed(x.status) : isClosed(x.status)) return false;
      if (view === 'MINE' && x.assigneeId !== myId) return false;
      if (!q) return true;
      return x.subject.toLowerCase().includes(q) || (x.patientName ?? '').toLowerCase().includes(q) || String(x.number) === q;
    });
  }, [all, type, view, search, myId]);

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      { id: 'number', header: '#', accessorFn: (x) => x.number, meta: { cellClassName: 'px-4 py-3 text-xs text-gray-400 tabular-nums whitespace-nowrap', headerClassName: 'w-16' }, cell: ({ row }) => `#${row.original.number}` },
      {
        id: 'subject', header: 'Subject', accessorFn: (x) => x.subject.toLowerCase(), meta: { cellClassName: 'px-4 py-3 min-w-[260px]' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate max-w-[520px]">{row.original.subject}{withEngineering(row.original) && <span className="ml-2 align-middle text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{t('With engineering')}</span>}</p>
            <p className="text-xs text-gray-500 truncate">{row.original.patientName ?? t('No patient linked')}</p>
          </div>
        ),
      },
      {
        id: 'type', header: 'Type', accessorFn: (x) => x.type, meta: { cellClassName: 'px-4 py-3 whitespace-nowrap' },
        cell: ({ row }) => <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_CLS[row.original.type]}`}>{t(TYPE_LABEL[row.original.type])}</span>,
      },
      {
        id: 'priority', header: 'Priority', accessorFn: (x) => PRIORITY_RANK[x.priority], sortDescFirst: true, meta: { cellClassName: 'px-4 py-3 whitespace-nowrap' },
        cell: ({ row }) => <span className={`text-xs ${PRIORITY_CLS[row.original.priority]}`}>{t(PRIORITY_LABEL[row.original.priority])}</span>,
      },
      {
        id: 'status', header: 'Status', accessorFn: (x) => STATUS_RANK[x.status], meta: { cellClassName: 'px-4 py-3 whitespace-nowrap' },
        cell: ({ row }) => <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLS[row.original.status]}`}>{t(STATUS_LABEL[row.original.status])}</span>,
      },
      {
        id: 'assignee', header: 'Assigned to', accessorFn: (x) => x.assigneeName ?? '￿', meta: { cellClassName: 'px-4 py-3 text-sm text-gray-700 whitespace-nowrap' },
        cell: ({ row }) => row.original.assigneeName ?? <span className="text-gray-400">{t('Nobody yet')}</span>,
      },
      {
        id: 'opened', header: 'Opened', accessorFn: (x) => new Date(x.createdAt).getTime(), meta: { cellClassName: 'px-4 py-3 text-xs text-gray-500 whitespace-nowrap' },
        cell: ({ row }) => timeAgo(row.original.createdAt),
      },
      {
        id: 'reply', header: 'Reply', meta: { cellClassName: 'px-4 py-3 text-xs whitespace-nowrap' },
        // Sorted by when the first reply is due: the ones most behind come first; answered ones go last.
        accessorFn: (x) => (x.firstResponseAt || !x.replyDueAt ? Number.MAX_SAFE_INTEGER : new Date(x.replyDueAt).getTime()),
        cell: ({ row }) => {
          const r = replyState(row.original);
          if (r.kind === 'replied') return <span className="text-gray-500">{t('Replied {when}', { when: timeAgo(row.original.firstResponseAt!) })}</span>;
          if (r.kind === 'late') return <span className="text-danger-500 font-medium">{t('Late by {time}', { time: shortHours(r.hours) })}</span>;
          if (r.kind === 'due') return <span className={r.hours < 1 ? 'text-amber-600 font-medium' : 'text-gray-500'}>{t('Due in {time}', { time: shortHours(r.hours) })}</span>;
          return <span className="text-gray-300">—</span>;
        },
      },
    ],
    [t, timeAgo],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getRowId: (x) => x.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    ...tableDefaults,
  });
  const pager = useTablePager(table, { view, type, search, sorting });

  const chip = (active: boolean) => `px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`;

  return (
    <div>
      <div data-guide="page-header" className="px-4 sm:px-6 py-5 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('Tickets')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{t('What patients have asked for help with, and who is handling it')}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEditReplies && <button type="button" onClick={() => setManagingReplies(true)} className="text-sm font-medium border border-gray-300 text-gray-700 bg-white rounded-lg px-3.5 py-2 hover:bg-gray-50">{t('Saved replies')}</button>}
          <button data-guide="tickets:new" type="button" onClick={() => setCreating(true)} className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-medium">{t('New ticket')}</button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5 space-y-4">
        <ErrorAlert error={error} />

        <div data-guide="tickets:filters" className="flex flex-wrap items-center gap-2">
          <SearchInput className="w-full sm:w-72" value={search} onChange={setSearch} placeholder={t('Search subject, patient or #…')} ariaLabel={t('Search tickets')} clearLabel={t('Clear search')} />
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-2">
            <button type="button" onClick={() => setView('ACTIVE')} className={chip(view === 'ACTIVE')}>{t('Active')} · {active.length}</button>
            <button type="button" onClick={() => setView('MINE')} className={chip(view === 'MINE')}>{t('Mine')} · {active.filter((x) => x.assigneeId === myId).length}</button>
            <button type="button" onClick={() => setView('ENGINEERING')} className={chip(view === 'ENGINEERING')}>{t('With engineering')} · {all.filter(withEngineering).length}</button>
            <button type="button" onClick={() => setView('RESOLVED')} className={chip(view === 'RESOLVED')}>{t('Resolved')}</button>
            <span className="w-px h-4 bg-gray-200 mx-1" />
            <button type="button" onClick={() => setType('ALL')} className={chip(type === 'ALL')}>{t('All types')}</button>
            {(Object.keys(TYPE_LABEL) as TicketType[]).map((ty) => (
              <button key={ty} type="button" onClick={() => setType(type === ty ? 'ALL' : ty)} className={chip(type === ty)}>{t(TYPE_LABEL[ty])}</button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <LoadingState />
        ) : (
          <>
            <div data-guide="tickets:list" className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id} className="group bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
                      {group.headers.map((header) => <SortableTh key={header.id} header={header} />)}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <DataRows table={table} rowProps={(x) => ({ onClick: () => router.push(`/tickets/${x.id}`), className: 'cursor-pointer hover:bg-gray-50' })} />
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="p-12 text-center text-sm text-gray-400">{all.length === 0 ? t('No tickets yet.') : t('No tickets match.')}</div>
              )}
            </div>
            <Pagination state={pager} />
          </>
        )}
      </div>

      {managingReplies && <SavedRepliesDialog onClose={() => setManagingReplies(false)} />}
      {creating && <NewTicketDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.push(`/tickets/${id}`); }} />}
    </div>
  );
}
