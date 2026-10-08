'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { ME_NAME } from '@/graphql/patient';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';
import { MY_TREATMENT_PLAN } from '@/graphql/portal';
import { SubscriptionStatus } from '@/components/dashboard/SubscriptionStatus';
import { ReportSideEffectDialog } from '@/components/doses/ReportSideEffectDialog';
import { PlanHero } from '@/components/home/PlanHero';
import { ProgressOverview } from '@/components/home/ProgressOverview';
import { WeightTrendNotice } from '@/components/weight/WeightTrendNotice';
import { ProfileSummaryCard } from '@/components/home/ProfileSummaryCard';
import { TreatmentPlanCard } from '@/components/home/TreatmentPlanCard';
import { AppointmentCard, ChatCard, ContactCard, EmergencyCard } from '@/components/home/SideCards';
import { RecentUpdates } from '@/components/home/RecentUpdates';
import { RecentOrders } from '@/components/home/RecentOrders';
import { QuickLinks } from '@/components/home/QuickLinks';
import { Card, btnPrimary } from '@/components/portal/Card';
import { useCareStage } from '@/lib/useCareStage';
import { Icon } from '@/components/portal/Icon';

/** One line that needs the patient's attention, with the action beside it. */
function Notice({ tone, title, text, href, action }: { tone: 'warn' | 'info'; title: string; text: string; href: string; action: string }) {
  return (
    <div className={`rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 ${tone === 'warn' ? 'bg-orange-50 border-orange-100' : 'bg-white border-slate-200/70'}`}>
      <p className="text-sm min-w-0"><b className="text-ink-900">{title}</b> <span className="text-slate-500">{text}</span></p>
      <Link href={href} className="flex-shrink-0 text-sm font-medium text-ink-600 hover:text-ink-800">{action}</Link>
    </div>
  );
}

export default function DashboardPage() {
  const [reporting, setReporting] = useState(false);
  const { data: nameData } = useQuery(ME_NAME);
  const { data: consultData, loading } = useQuery(MY_CONSULTATIONS);
  // Refetched on every visit, so a check-in or weigh-in just done shows up straight away.
  const { data: journeyData } = useQuery(MY_WEIGHT_JOURNEY, { fetchPolicy: 'cache-and-network' });
  const { data: planData, loading: planLoading } = useQuery(MY_TREATMENT_PLAN, { fetchPolicy: 'cache-and-network' });
  const journey = journeyData?.myWeightJourney;
  const next = useCareStage();
  const plan = planData?.myTreatmentPlan;

  const consultations = consultData?.myConsultations ?? [];
  const needsInfo = consultations.some((c: any) => c.status === 'MORE_INFO_REQUESTED');
  const firstName = nameData?.me?.firstName;

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-5 -mt-1">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink-900">{firstName ? `Welcome back, ${firstName}!` : 'Welcome back!'}</h1>
          <p className="text-sm text-slate-500 mt-0.5 mb-2">Here’s your health journey at a glance.</p>
          <SubscriptionStatus />
        </div>
        <div className="flex items-start gap-2">
          <button type="button" onClick={() => setReporting(true)} className="text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg px-3 py-1.5">
            Report a side effect
          </button>
        </div>
      </div>

      <div className="space-y-2 mb-4 empty:hidden">
        {!loading && needsInfo && (
          <Notice tone="warn" title="Your clinician needs more information." text="Check your messages, then update your answers." href="/onboarding/medical-questionnaire?from=dashboard" action="Update answers →" />
        )}
        {journey && <WeightTrendNotice />}
      </div>

      <ProgressOverview journey={journey} plan={plan} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18.5rem] gap-5 items-start">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-5 min-w-0 [&>*]:min-w-0">
          <div className="md:col-span-6">
            {plan ? (
              <PlanHero plan={plan} />
            ) : (
              <Card className="h-full">
                <p className="text-sm font-medium text-ink-700">Current Treatment Plan</p>
                <h2 className="text-xl font-bold text-ink-900 mt-2">{planLoading || next.stage === 'LOADING' ? 'Loading…' : next.title}</h2>
                {!planLoading && next.text && <p className="text-sm text-slate-500 mt-2 max-w-xl">{next.text}</p>}
                {!planLoading && next.action && <Link href={next.action.href} className={`${btnPrimary} mt-4`}>{next.action.label}</Link>}
              </Card>
            )}
          </div>
          {plan && <div className="md:col-span-6"><TreatmentPlanCard plan={plan} /></div>}

          <div className="md:col-span-3 2xl:col-span-2"><RecentUpdates /></div>
          <div className="md:col-span-3 2xl:col-span-2"><RecentOrders /></div>
          <div className="md:col-span-6 2xl:col-span-2"><QuickLinks /></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-5 min-w-0 [&>*]:min-w-0">
          <ProfileSummaryCard journey={journey} />
          <ChatCard />
          <AppointmentCard />
          <EmergencyCard />
          <ContactCard />
        </div>
      </div>

      <footer className="mt-8 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <p className="flex items-center gap-2"><Icon name="help" className="w-4 h-4" /> Your health is our priority. We’re here to support you every step of the way.</p>
        <nav className="flex gap-5" aria-label="Legal">
          <Link href="/settings#privacy" className="hover:text-ink-800">Privacy</Link>
          <Link href="/settings#help" className="hover:text-ink-800">Help</Link>
        </nav>
      </footer>

      {reporting && <ReportSideEffectDialog onClose={() => setReporting(false)} />}
    </div>
  );
}
