'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { PATIENT_LAB_RESULTS, PATIENT_TRT_MONITORING } from '@/graphql/labs';
import { KIND_LABEL, type TrtMonitoring } from './labs-format';
import { TrtMonitoringCard } from './TrtMonitoringCard';
import { RecordLabResultForm } from './RecordLabResultForm';

type LabResult = {
  id: string;
  kind: string;
  analyteName?: string | null;
  value: number;
  unit: string;
  referenceRangeLow?: number | null;
  referenceRangeHigh?: number | null;
  flagged: boolean;
  collectedAt: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  enteredBy?: { firstName: string; lastName: string } | null;
};

function rangeText(low?: number | null, high?: number | null) {
  if (low != null && high != null) return ` (range ${low}–${high})`;
  if (high != null) return ` (range ≤ ${high})`;
  if (low != null) return ` (range ≥ ${low})`;
  return '';
}

/** A patient's lab results, the testosterone monitoring schedule (TRT only), and entry of new results. */
export default function LabsPanel({ patientId, canRecord }: { patientId: string; canRecord: boolean }) {
  const [adding, setAdding] = useState(false);
  const { data } = useQuery(PATIENT_LAB_RESULTS, { variables: { patientId } });
  const { data: trtData } = useQuery(PATIENT_TRT_MONITORING, { variables: { patientId } });
  const results: LabResult[] = data?.patientLabResults ?? [];
  const monitoring: TrtMonitoring | null = trtData?.patientTrtMonitoring ?? null;

  return (
    <div className="p-5 space-y-5">
      {monitoring && <TrtMonitoringCard monitoring={monitoring} />}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Results</p>
          {canRecord && !adding && (
            <button onClick={() => setAdding(true)} className="text-xs font-medium text-brand-500 hover:text-brand-900">+ Record result</button>
          )}
        </div>
        {adding && <div className="mb-3"><RecordLabResultForm patientId={patientId} onDone={() => setAdding(false)} /></div>}
        {results.length === 0 && !adding && <p className="text-sm text-gray-400">No lab results recorded yet.</p>}
        <ul className="divide-y divide-gray-100">
          {results.map((r) => {
            const range = rangeText(r.referenceRangeLow, r.referenceRangeHigh);
            return (
              <li key={r.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="text-gray-800">
                    {r.kind === 'OTHER' ? r.analyteName : KIND_LABEL[r.kind] ?? r.kind}{' '}
                    <span className={r.flagged ? 'text-danger-500 font-semibold' : 'font-medium'}>{r.value} {r.unit}</span>
                    <span className="text-xs text-gray-400">{range}</span>
                  </p>
                  {r.reviewNote && <p className="text-xs text-gray-500 mt-0.5">Review: {r.reviewNote}</p>}
                </div>
                <div className="text-right text-xs text-gray-400 flex-shrink-0">
                  <p>{format(new Date(r.collectedAt), 'd MMM yyyy')}</p>
                  {r.flagged && <p className={r.reviewedAt ? 'text-green-700' : 'text-danger-500'}>{r.reviewedAt ? 'Reviewed' : 'Out of range'}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
