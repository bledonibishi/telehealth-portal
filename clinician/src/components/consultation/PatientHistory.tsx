'use client';

import { useQuery } from '@apollo/client';
import { formatDistanceToNow } from 'date-fns';
import { PATIENT_HISTORY } from '@/graphql/consultations';

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'New',
  IN_REVIEW: 'In review',
  MORE_INFO_REQUESTED: 'Awaiting info',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
};

export function PatientHistory({ patientId, excludeId }: { patientId: string; excludeId: string }) {
  const { data, loading } = useQuery(PATIENT_HISTORY, { variables: { patientId } });

  const history = (data?.patientHistory ?? []).filter((c: any) => c.id !== excludeId);

  if (loading) return <p className="text-xs text-gray-400">Loading history…</p>;
  if (history.length === 0) return <p className="text-xs text-gray-400">No prior consultations.</p>;

  return (
    <ul className="space-y-2">
      {history.map((c: any) => {
        const hasCritical = c.redFlags.some((f: any) => f.severity === 'CRITICAL');
        return (
          <li key={c.id} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-gray-800">{c.kind}</span>
              {hasCritical && (
                <span className="inline-block w-2 h-2 rounded-full bg-danger-500 flex-shrink-0" title="Critical flag" />
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {STATUS_LABELS[c.status] ?? c.status} ·{' '}
              {formatDistanceToNow(new Date(c.submittedAt), { addSuffix: true })}
            </div>
            {c.prescription && (
              <div className="text-xs text-green-700 mt-0.5">{c.prescription.medication}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
