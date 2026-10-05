'use client';

import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_SIDE_EFFECT_REPORTS } from '@/graphql/portal';
import { EFFECT_LABEL } from './ReportSideEffectDialog';
import { Card, CardHeader } from '@/components/portal/Card';

const SEVERITY: Record<string, string> = { MILD: 'bg-slate-100 text-slate-600', MODERATE: 'bg-amber-50 text-amber-700', SEVERE: 'bg-red-50 text-red-700' };

/** What the patient has told their doctor about how they feel, and whether a doctor has seen it yet. */
export function SideEffectHistory({ onReport }: { onReport: () => void }) {
  const { data } = useQuery(MY_SIDE_EFFECT_REPORTS, { fetchPolicy: 'cache-and-network' });
  const reports: any[] = data?.mySideEffectReports ?? [];
  return (
    <Card labelledBy="se-title">
      <CardHeader id="se-title" title="Side effects" subtitle="What you’ve reported goes straight to your doctor.">
        <button type="button" onClick={onReport} className="flex-shrink-0 text-xs font-semibold text-ink-700 border border-ink-600/40 hover:bg-ink-50 rounded-lg px-3 py-1.5">Report one</button>
      </CardHeader>
      {reports.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing reported. If something doesn’t feel right, tell your doctor here — you don’t need to wait for your check-in.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {reports.slice(0, 6).map((r) => (
            <li key={r.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink-900">{r.effects.map((e: string) => EFFECT_LABEL[e] ?? e).join(', ')}</p>
                <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${SEVERITY[r.severity]}`}>{r.severity.charAt(0) + r.severity.slice(1).toLowerCase()}</span>
              </div>
              {r.note && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{r.note}</p>}
              <p className="text-[11px] text-slate-400 mt-1">{format(new Date(r.createdAt), 'd MMM yyyy, HH:mm')} · {r.acknowledgedAt ? 'Seen by your doctor' : 'Sent to your doctor'}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
