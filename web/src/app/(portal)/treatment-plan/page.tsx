'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { format, isToday, isTomorrow } from 'date-fns';
import { MY_TREATMENT_PLAN } from '@/graphql/portal';
import { MY_DOSE_CALENDAR } from '@/graphql/dosing';
import { PlanHero } from '@/components/home/PlanHero';
import { SupplyBar } from '@/components/home/TreatmentPlanCard';
import { OrderEarlyButton } from '@/components/home/OrderEarlyButton';
import { DoseAdherence } from '@/components/dashboard/DoseAdherence';
import { ReportSideEffectDialog } from '@/components/doses/ReportSideEffectDialog';
import { SideEffectHistory } from '@/components/doses/SideEffectHistory';
import { WeeklySideEffectCard } from '@/components/doses/SideEffectTracker';
import { TreatmentTimeline } from '@/components/home/TreatmentTimeline';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';
import { Card, CardHeader, btnSoft } from '@/components/portal/Card';
import { PageHeader } from '@/components/portal/PageHeader';
import { EmptyState } from '@/components/portal/EmptyState';
import { Icon } from '@/components/portal/Icon';

const dayLabel = (d: Date) => (isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEEE d MMMM'));

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-ink-900 font-medium text-right">{value}</dd>
    </div>
  );
}

/** The whole plan: what the patient takes and how, how far through it they are, the next doses, and the next supply. */
export default function TreatmentPlanPage() {
  const { data, loading } = useQuery(MY_TREATMENT_PLAN, { fetchPolicy: 'cache-and-network' });
  const { data: cal } = useQuery(MY_DOSE_CALENDAR, { variables: { fromDays: 0, toDays: 42 }, fetchPolicy: 'cache-and-network' });
  const [reporting, setReporting] = useState(false);
  const { data: jData } = useQuery(MY_WEIGHT_JOURNEY, { fetchPolicy: 'cache-first' });
  const plan = data?.myTreatmentPlan;
  const upcoming = ((cal?.myDoseCalendar ?? []) as any[]).filter((d) => d.status === 'SCHEDULED' && Date.parse(d.scheduledFor) >= Date.now() - 86_400_000).slice(0, 5);

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-6xl">
      <PageHeader title="My Treatment" subtitle="Your medicine, your schedule and your next supply." />

      {!plan ? (
        loading ? <Card><div className="h-28 rounded-xl bg-slate-50 animate-pulse" role="status" aria-label="Loading" /></Card>
          : <EmptyState icon="plan" what="Your treatment plan" whenTreating={{ text: 'Your plan is being set up.' }} />
      ) : (
        <div className="space-y-5">
          <PlanHero plan={plan} />

          <div className="grid lg:grid-cols-3 gap-5 items-start">
            <Card labelledBy="supply-title" className="lg:col-span-2">
              <CardHeader id="supply-title" title="This supply" subtitle="Order your next one a few days before this one runs out." />
              {plan.supplyDosesTotal != null ? (
                <>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-3xl font-bold text-ink-900">{plan.supplyDosesTaken ?? 0}<span className="text-base font-medium text-slate-400"> / {plan.supplyDosesTotal} injections used</span></p>
                  </div>
                  <SupplyBar used={plan.supplyDosesTaken ?? 0} total={plan.supplyDosesTotal} />
                </>
              ) : (
                <p className="text-sm text-slate-500">Your supply count starts once your first delivery has been sent.</p>
              )}
              <OrderEarlyButton className="mt-5" />
              <DoseAdherence />
            </Card>

            <Card labelledBy="next-title">
              <CardHeader id="next-title" title="Upcoming doses" href="/doses" action="Dose calendar →" />
              {upcoming.length ? (
                <ul className="space-y-2.5">
                  {upcoming.map((d, i) => (
                    <li key={d.id} className={`flex items-center gap-3 rounded-xl p-3 ${i === 0 ? 'bg-ink-50' : 'bg-slate-50'}`}>
                      <Icon name="syringe" className="w-5 h-5 text-ink-700" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-900">{dayLabel(new Date(d.scheduledFor))}</p>
                        <p className="text-xs text-slate-500">{d.product?.brandName ?? d.product?.name} {d.strength?.label}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Your next doses will appear here once they are scheduled.</p>
              )}
              <p className="text-xs text-slate-500 mt-3">Log each injection on the <Link href="/doses" className="text-ink-600 underline">dose calendar</Link> so your supply count stays right.</p>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-5 items-start">
            <TreatmentTimeline plan={plan} journey={jData?.myWeightJourney} />
            <div className="space-y-5">
              <WeeklySideEffectCard />
              <SideEffectHistory onReport={() => setReporting(true)} />
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-5 items-start">
            <Card labelledBy="facts-title" className="lg:col-span-2">
              <CardHeader id="facts-title" title="Plan details" href="/prescription" action="Prescription →" />
              <dl>
                <Fact label="Programme" value={plan.programme} />
                <Fact label="Product" value={`${plan.productName}${plan.genericName ? ` (${plan.genericName})` : ''}`} />
                <Fact label="Current dose" value={plan.strength ? `${plan.strength}${plan.titrationStep ? ` · step ${plan.titrationStep}` : ''}` : null} />
                <Fact label="Frequency" value={plan.frequency} />
                <Fact label="How to take it" value={plan.directions} />
                <Fact label="Started" value={format(new Date(plan.startedAt), 'd MMMM yyyy')} />
                <Fact label="Duration" value={plan.durationWeeks ? `${plan.durationWeeks} weeks (week ${Math.min(plan.weeksElapsed + 1, plan.durationWeeks)})` : null} />
                <Fact label="Prescription valid until" value={plan.validUntil ? format(new Date(plan.validUntil), 'd MMMM yyyy') : null} />
                <Fact label="Repeats left" value={String(plan.repeatsLeft)} />
                <Fact label="Prescribed by" value={plan.prescriberName} />
              </dl>
            </Card>

            <Card>
              <h2 className="text-base font-semibold text-ink-900">Not feeling right?</h2>
              <p className="text-sm text-slate-500 mt-1">Tell your doctor about a side effect, or ask to see them.</p>
              <div className="grid gap-2 mt-4">
                <button type="button" onClick={() => setReporting(true)} className={btnSoft}>Report a side effect</button>
                <Link href="/appointments?new=1" className={btnSoft}>Book an appointment</Link>
                <Link href="/messages" className={btnSoft}>Message your doctor</Link>
              </div>
              <Link href="/consultations" className="block text-xs text-slate-500 hover:text-ink-700 mt-4">Your consultation history →</Link>
            </Card>
          </div>
        </div>
      )}

      {reporting && <ReportSideEffectDialog onClose={() => setReporting(false)} />}
    </div>
  );
}
