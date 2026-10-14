'use client';

import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_SUPPORT_REQUESTS } from '@/graphql/support';

type Status = 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_PATIENT' | 'RESOLVED' | 'CLOSED';
type Request = { id: string; number: number; status: Status; subject: string; createdAt: string; attachments?: { id: string }[] };

const STATUS_TEXT: Record<Status, { label: string; cls: string }> = {
  OPEN: { label: 'Received', cls: 'bg-amber-50 text-amber-700' },
  IN_PROGRESS: { label: 'We’re on it', cls: 'bg-blue-50 text-blue-700' },
  WAITING_ON_PATIENT: { label: 'We need your reply', cls: 'bg-amber-50 text-amber-700' },
  RESOLVED: { label: 'Resolved', cls: 'bg-green-50 text-green-700' },
  CLOSED: { label: 'Closed', cls: 'bg-slate-100 text-slate-500' },
};

/** What the patient has asked for help with, and where each request stands. */
export function RequestList() {
  const { data } = useQuery(MY_SUPPORT_REQUESTS, { fetchPolicy: 'cache-and-network', pollInterval: 60_000 });
  const requests: Request[] = data?.mySupportRequests ?? [];
  if (requests.length === 0) return <p className="text-sm text-slate-400">You haven’t sent any requests yet.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {requests.map((r) => (
        <li key={r.id} className="py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 break-words">{r.subject}</p>
            <p className="text-xs text-slate-400 mt-0.5">#{r.number} · {format(new Date(r.createdAt), 'dd MMM yyyy')}{r.attachments?.length ? ` · ${r.attachments.length} file${r.attachments.length === 1 ? '' : 's'}` : ''}</p>
          </div>
          <span className={`flex-shrink-0 text-xs font-medium px-2 py-1 rounded-full ${STATUS_TEXT[r.status].cls}`}>{STATUS_TEXT[r.status].label}</span>
        </li>
      ))}
    </ul>
  );
}
