'use client';

import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { MY_CONSULTATIONS } from '@/graphql/consultations';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'Under review', cls: 'bg-blue-100 text-blue-700' },
  IN_REVIEW: { label: 'In review', cls: 'bg-yellow-100 text-yellow-700' },
  MORE_INFO_REQUESTED: { label: 'Info requested', cls: 'bg-orange-100 text-orange-700' },
  APPROVED: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  DECLINED: { label: 'Declined', cls: 'bg-slate-100 text-slate-500' },
};

export default function DashboardPage() {
  const { data, loading, error } = useQuery(MY_CONSULTATIONS);

  const consultations = data?.myConsultations ?? [];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">My consultations</h1>
        <p className="text-sm text-slate-500 mt-1">Track the status of your treatment requests.</p>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-danger-500">{error.message}</p>}

      {!loading && consultations.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <p className="text-slate-400 text-sm">No consultations yet.</p>
        </div>
      )}

      <div className="space-y-4">
        {consultations.map((c: any) => {
          const badge = STATUS_BADGE[c.status] ?? { label: c.status, cls: 'bg-slate-100 text-slate-500' };
          const hasCritical = c.redFlags?.some((f: any) => f.severity === 'CRITICAL');
          return (
            <div
              key={c.id}
              className="bg-white rounded-2xl border border-slate-100 p-6 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-slate-900">{c.kind}</span>
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${badge.cls}`}>
                    {badge.label}
                  </span>
                  {hasCritical && (
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-100 text-red-600">
                      Needs attention
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Submitted {formatDistanceToNow(new Date(c.submittedAt), { addSuffix: true })}
                </p>
                {c.prescription && (
                  <p className="text-xs text-green-600 mt-1 font-medium">
                    ✓ Prescription issued — {c.prescription.medication}
                  </p>
                )}
              </div>
              <Link
                href={`/consultation/${c.id}`}
                className="flex-shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                View details →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
