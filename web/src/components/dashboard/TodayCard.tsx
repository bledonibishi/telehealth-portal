'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { differenceInCalendarDays, format, isToday } from 'date-fns';
import { MY_DOSE_SUMMARY } from '@/graphql/dosing';
import { Dialog } from '@/components/common/Dialog';
import { LogWeightForm } from '@/components/weight/LogWeightForm';

type Item = { key: string; done: boolean; title: string; detail?: string; action?: React.ReactNode };

const btn = 'flex-shrink-0 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3 py-1.5';

/** What to do today, worked out from the patient's own dose, weigh-ins and check-in — and nothing else. */
export function TodayCard({ journey }: { journey?: any | null }) {
  const { data } = useQuery(MY_DOSE_SUMMARY, { fetchPolicy: 'cache-and-network' });
  const [logging, setLogging] = useState(false);
  const dose = data?.myDoseSummary;
  const items: Item[] = [];

  // Only what is due now: a dose that is today's (or late), a weigh-in not yet done, a check-in that is ready.
  // The next dose's date and the check-in countdown already sit on the cards beside this one.
  if (dose?.nextDoseAt) {
    const days = differenceInCalendarDays(new Date(dose.nextDoseAt), new Date());
    if (days <= 0) items.push({ key: 'dose', done: false, title: `Take your ${dose.current}`, detail: days < 0 ? 'It was due earlier' : 'Due today', action: <Link href="/doses" className={btn}>Log it</Link> });
  }

  if (journey?.startingWeightKg) {
    const weighedToday = journey.latestMeasurementAt && isToday(new Date(journey.latestMeasurementAt));
    items.push(
      weighedToday
        ? { key: 'weigh', done: true, title: 'Weighed in today', detail: `${journey.currentWeightKg} kg` }
        : { key: 'weigh', done: false, title: 'Log today’s weight', detail: 'Takes 10 seconds', action: <button type="button" onClick={() => setLogging(true)} className={btn}>Log</button> },
    );
    if (journey.checkInState === 'READY') {
      items.push({ key: 'checkin', done: false, title: 'Monthly check-in is ready', detail: 'Your doctor reviews it before your next supply', action: journey.checkInUrl ? <a href={journey.checkInUrl} className={btn}>Start</a> : undefined });
    }
  }

  if (items.length === 0) return null;
  const todo = items.filter((i) => !i.done).length;

  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5" aria-labelledby="today-title">
      <div className="flex items-center justify-between mb-3">
        <h2 id="today-title" className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Today</h2>
        <span className={`text-xs font-medium ${todo ? 'text-orange-600' : 'text-brand-700'}`}>{todo ? `${todo} to do` : 'All done ✓'}</span>
      </div>
      <ul className="space-y-2.5">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-3">
            <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] ${i.done ? 'bg-brand-600 text-white' : 'border-2 border-slate-300'}`} aria-hidden>{i.done ? '✓' : ''}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${i.done ? 'text-slate-500' : 'font-medium text-slate-900'} truncate`}>{i.title}</p>
              {i.detail && <p className="text-xs text-slate-400 truncate">{i.detail}</p>}
            </div>
            {i.action}
          </li>
        ))}
      </ul>

      {logging && (
        <Dialog title="Log your weight" onClose={() => setLogging(false)}>
          <LogWeightForm onSaved={() => setLogging(false)} onCancel={() => setLogging(false)} />
        </Dialog>
      )}
    </section>
  );
}
