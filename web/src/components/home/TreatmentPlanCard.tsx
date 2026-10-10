'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Card } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';
import { OrderEarlyButton } from './OrderEarlyButton';
import type { Plan } from './PlanHero';

const perWeek = (n?: number | null) => (n == null ? null : n === 1 ? '1 injection per week' : Number.isInteger(n) ? `${n} injections per week` : null);

/** The supply bar: how many injections of this supply are used, so the next order can be placed before it runs out. */
export function SupplyBar({ used, total }: { used: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const left = Math.max(total - used, 0);
  return (
    <div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={used} aria-label="Injections used from this supply">
        <div className={`h-full rounded-full ${left <= 1 ? 'bg-amber-500' : 'bg-emerald-500'} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-500 mt-1.5">{left === 0 ? 'This supply is used up' : left === 1 ? '1 injection left in this supply' : `${left} injections left in this supply`}</p>
    </div>
  );
}

/** The treatment in detail: frequency, how much of the current supply is used, the next injection and the plan's facts. */
export function TreatmentPlanCard({ plan }: { plan: Plan }) {
  const freq = perWeek(plan.dosesPerWeek) ?? plan.frequency;
  return (
    <Card labelledBy="tp-title" className="h-full">
      <h2 id="tp-title" className="text-base font-semibold text-ink-900">Your Treatment Plan</h2>
      <p className="text-sm text-slate-500 mt-1">{plan.productName}{plan.genericName ? ` (${plan.genericName})` : ''}</p>

      <div className="flex items-center justify-between gap-3 mt-4">
        <span className="rounded-full bg-ink-50 text-ink-800 text-xs font-semibold px-3 py-1">{freq}</span>
        {plan.supplyDosesTotal != null && <span className="text-xs text-slate-500">{plan.supplyDosesTaken ?? 0} / {plan.supplyDosesTotal} used</span>}
      </div>
      {plan.supplyDosesTotal != null && <div className="mt-3"><SupplyBar used={plan.supplyDosesTaken ?? 0} total={plan.supplyDosesTotal} /></div>}

      <div className="mt-4 rounded-md border border-slate-200 p-3">
        <p className="text-sm text-slate-600">Next injection: <b className="text-ink-900">{plan.nextDoseAt ? format(new Date(plan.nextDoseAt), 'dd MMM yyyy') : '—'}</b></p>
        <OrderEarlyButton variant="outline" className="mt-3" />
      </div>

      <h3 className="text-sm font-semibold text-ink-900 mt-5">Plan Details</h3>
      <ul className="mt-2 space-y-1 text-sm text-slate-600 list-disc pl-5 marker:text-slate-400">
        <li>Product: {plan.productName}{plan.genericName ? ` (${plan.genericName})` : ''}</li>
        {plan.strength && <li>Dose: {plan.strength} (current)</li>}
        <li>Frequency: {plan.frequency}</li>
        {plan.durationWeeks && <li>Total duration: {plan.durationWeeks} weeks</li>}
        {plan.prescriberName && <li>Prescribed by {plan.prescriberName}</li>}
      </ul>
      <Link href="/treatment-plan" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-800 mt-4">View Full Plan <Icon name="arrow" className="w-4 h-4" /></Link>
    </Card>
  );
}
