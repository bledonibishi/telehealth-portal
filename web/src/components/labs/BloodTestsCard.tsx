'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { format, isPast } from 'date-fns';
import { MY_TRT_MONITORING } from '@/graphql/labs';

const LABEL: Record<string, string> = { TESTOSTERONE: 'Testosterone level', HEMATOCRIT: 'Haematocrit (red blood cells)', PSA: 'PSA (prostate)' };

/**
 * Testosterone patients' safety blood tests: when each is next due. Only shown to patients on
 * testosterone (the query is null otherwise). Deliberately doesn't show values — the clinician
 * discusses results with them.
 */
export function BloodTestsCard() {
  const { data } = useQuery(MY_TRT_MONITORING);
  const m = data?.myTrtMonitoring;
  if (!m) return null;

  return (
    <section className={`rounded-2xl border p-5 mb-6 ${m.refillsOnHold ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`} aria-label="Blood tests">
      <h2 className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Blood tests</h2>
      {m.refillsOnHold ? (
        <p className="text-sm text-amber-900 mt-2">
          Your next supply is paused until we have your latest blood test results. Please book your test, or{' '}
          <Link href="/messages" className="font-semibold underline">message your clinician</Link> if you’ve already had it.
        </p>
      ) : (
        <p className="text-sm text-slate-500 mt-2">Regular blood tests keep testosterone treatment safe. Here’s when each is next due.</p>
      )}
      <ul className="mt-3 divide-y divide-slate-100">
        {m.labs.map((l: { kind: string; dueAt: string; overdue: boolean; lastCollectedAt?: string | null }) => {
          const due = new Date(l.dueAt);
          return (
            <li key={l.kind} className="py-2 flex items-center justify-between text-sm">
              <span className="text-slate-700">{LABEL[l.kind] ?? l.kind}</span>
              <span className={l.overdue ? 'text-danger-500 font-semibold' : isPast(due) ? 'text-amber-700 font-medium' : 'text-slate-500'}>
                {isPast(due) ? `Due since ${format(due, 'd MMM')}` : `Due ${format(due, 'd MMM yyyy')}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
