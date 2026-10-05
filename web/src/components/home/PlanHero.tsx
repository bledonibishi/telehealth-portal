'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Icon } from '@/components/portal/Icon';
import { btnPrimary } from '@/components/portal/Card';
import { PenIllustration } from './PenIllustration';
import { OrderEarlyButton } from './OrderEarlyButton';

export type Plan = {
  programme: string; productName: string; genericName?: string | null; strength?: string | null; frequency: string; dosesPerWeek?: number | null;
  startedAt: string; validUntil?: string | null; durationWeeks?: number | null; weeksElapsed: number; dosesTaken: number; dosesPlanned?: number | null;
  supplyDosesTotal?: number | null; supplyDosesTaken?: number | null; nextDoseAt?: string | null; prescriberName?: string | null; directions?: string | null; repeatsLeft: number;
};

/** A ring that fills as the plan's injections are taken. */
export function DoseRing({ taken, total, size = 96 }: { taken: number; total: number; size?: number }) {
  const r = 42, c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(taken / total, 1) : 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${taken} of ${total} injections taken`}>
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-slate-100" />
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-emerald-500"
        strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="57" textAnchor="middle" className="fill-ink-900" fontSize="20" fontWeight="700">{taken}/{total}</text>
    </svg>
  );
}

/** One dot per injection in the current supply (or the plan), filled once taken. */
export function DoseDots({ taken, total }: { taken: number; total: number }) {
  const n = Math.min(total, 16);
  return (
    <ul className="flex items-center gap-2" aria-label={`${taken} of ${total} injections taken`}>
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className={`w-2.5 h-2.5 rounded-full ${i < taken ? 'bg-ink-800' : i === taken ? 'bg-ink-600/50' : 'bg-ink-100'}`} />
      ))}
    </ul>
  );
}

/** The top card: which programme the patient is on, since when and for how long, and how far through it they are. */
export function PlanHero({ plan }: { plan: Plan }) {
  const total = plan.dosesPlanned ?? plan.supplyDosesTotal ?? plan.dosesTaken;
  const dotsTotal = plan.supplyDosesTotal ?? total;
  const dotsTaken = plan.supplyDosesTotal != null ? plan.supplyDosesTaken ?? 0 : plan.dosesTaken;
  return (
    <section aria-labelledby="plan-title" className="h-full rounded-2xl border border-ink-100 bg-gradient-to-br from-ink-50 via-[#e9f0fd] to-[#dde8fb] p-5">
      <div className="h-full grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_13rem] gap-4 items-center [&>*]:min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_7.5rem] gap-3 items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-700">Current Treatment Plan</p>
            <h2 id="plan-title" className="text-xl font-bold text-ink-900 mt-2 leading-tight">{plan.programme}</h2>
            <p className="text-sm font-medium text-ink-600 mt-1">{plan.productName}{plan.genericName ? ` (${plan.genericName})` : ''}{plan.strength ? ` · ${plan.strength}` : ''}</p>
            <span className="inline-flex items-center rounded-full bg-emerald-500 text-white text-xs font-semibold px-3 py-1 mt-4">Active</span>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center gap-2.5 text-slate-600"><Icon name="calendar" className="w-4 h-4 text-ink-800 flex-shrink-0" /><dt className="whitespace-nowrap">Started on:</dt><dd className="font-semibold text-ink-900 whitespace-nowrap">{format(new Date(plan.startedAt), 'd MMM yyyy')}</dd></div>
              {plan.durationWeeks && <div className="flex items-center gap-2.5 text-slate-600"><Icon name="clock" className="w-4 h-4 text-ink-800" /><dt>Duration:</dt><dd className="font-semibold text-ink-900">{plan.durationWeeks} weeks</dd></div>}
            </dl>
            <Link href="/treatment-plan" className={`${btnPrimary} mt-5 whitespace-nowrap`}>View Plan Details <Icon name="arrow" className="w-4 h-4" /></Link>
          </div>
          <div className="hidden sm:flex items-center justify-center rounded-2xl bg-white/70 border border-white h-36">
            <PenIllustration label={plan.productName} className="w-28 h-28" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-ink-100 p-4">
          <p className="text-sm font-medium text-ink-700">Your Progress</p>
          <div className="flex items-center gap-3 mt-3">
            <DoseRing taken={plan.dosesTaken} total={Math.max(total, plan.dosesTaken)} size={84} />
            <p className="text-sm text-slate-600 leading-snug">injections<br />taken</p>
          </div>
          {dotsTotal > 0 && <div className="mt-4"><DoseDots taken={dotsTaken} total={dotsTotal} /></div>}
          <p className="text-sm text-slate-600 mt-4">
            Next injection due: <b className="text-ink-900">{plan.nextDoseAt ? format(new Date(plan.nextDoseAt), 'dd MMM yyyy') : '—'}</b>
          </p>
          <OrderEarlyButton className="mt-3" fullWidth />
        </div>
      </div>
    </section>
  );
}
