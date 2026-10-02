'use client';

import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_DOSE_CALENDAR } from '@/graphql/dosing';

const DOT: Record<string, string> = {
  TAKEN: 'bg-brand-600',
  MISSED: 'bg-red-400',
  SKIPPED: 'bg-slate-300',
  SCHEDULED: 'bg-amber-400', // past its time, not logged yet
};
const LABEL: Record<string, string> = { TAKEN: 'taken', MISSED: 'missed', SKIPPED: 'skipped', SCHEDULED: 'not logged yet' };

/** The last few doses as dots, and how many were taken: a streak the patient can see, from their own dose log. */
export function DoseAdherence() {
  const { data } = useQuery(MY_DOSE_CALENDAR, { variables: { fromDays: 56, toDays: 0 }, fetchPolicy: 'cache-and-network' });
  const past = ((data?.myDoseCalendar ?? []) as any[]).filter((d) => Date.parse(d.scheduledFor) <= Date.now());
  if (past.length === 0) return null;

  const recent = past.slice(-12);
  const taken = past.filter((d) => d.status === 'TAKEN').length;
  const counted = past.filter((d) => d.status === 'TAKEN' || d.status === 'MISSED').length;

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs text-slate-500"><b className="text-slate-700">{taken} of {Math.max(counted, taken)}</b> doses taken · last 8 weeks</p>
      </div>
      <ul className="flex items-center gap-1.5" aria-label="Recent doses">
        {recent.map((d) => (
          <li key={d.id} className={`w-3.5 h-3.5 rounded-full ${DOT[d.status] ?? 'bg-slate-200'}`} title={`${format(new Date(d.scheduledFor), 'd MMM')} · ${LABEL[d.status] ?? d.status}`} />
        ))}
      </ul>
    </div>
  );
}
