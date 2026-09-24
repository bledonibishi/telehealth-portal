'use client';

import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { MY_CONSULTATIONS } from '@/graphql/consultations';

export default function MessagesPage() {
  const { data, loading } = useQuery(MY_CONSULTATIONS);
  const consultations = (data?.myConsultations ?? []).filter(
    (c: any) => c.status === 'MORE_INFO_REQUESTED' || c.status === 'IN_REVIEW' || c.status === 'APPROVED',
  );

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
        <p className="text-sm text-slate-500 mt-1">Communicate securely with your clinician.</p>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}

      {!loading && consultations.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <p className="text-slate-400 text-sm">No active consultations with open messages.</p>
        </div>
      )}

      <div className="space-y-3">
        {consultations.map((c: any) => (
          <Link
            key={c.id}
            href={`/consultation/${c.id}`}
            className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 px-6 py-4 hover:border-brand-200 transition-colors group"
          >
            <div>
              <p className="font-medium text-slate-900">{c.kind} consultation</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {formatDistanceToNow(new Date(c.submittedAt), { addSuffix: true })}
              </p>
              {c.status === 'MORE_INFO_REQUESTED' && (
                <span className="inline-block mt-1 text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                  Reply requested
                </span>
              )}
            </div>
            <span className="text-sm text-brand-600 group-hover:text-brand-700">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
