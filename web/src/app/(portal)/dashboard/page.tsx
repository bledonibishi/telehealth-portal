'use client';

import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { MY_ORDERS } from '@/graphql/orders';
import { ME_NAME } from '@/graphql/patient';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';
import { WeightJourneyCard } from '@/components/weight/WeightJourneyCard';
import { TreatmentCard } from '@/components/doses/TreatmentCard';
import { TodayCard } from '@/components/dashboard/TodayCard';
import { CareTeamCard } from '@/components/dashboard/CareTeamCard';
import { ManageSubscriptionButton } from '@/components/billing/ManageSubscriptionCard';

/** One line that needs the patient's attention, with the action beside it. */
function Notice({ tone, title, text, href, action }: { tone: 'warn' | 'info'; title: string; text: string; href: string; action: string }) {
  return (
    <div className={`rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 ${tone === 'warn' ? 'bg-orange-50 border-orange-100' : 'bg-white border-slate-100'}`}>
      <p className="text-sm min-w-0"><b className="text-slate-900">{title}</b> <span className="text-slate-500">{text}</span></p>
      <Link href={href} className="flex-shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700">{action}</Link>
    </div>
  );
}

export default function DashboardPage() {
  const { data: nameData } = useQuery(ME_NAME);
  const { data: consultData, loading: consultLoading } = useQuery(MY_CONSULTATIONS);
  const { data: ordersData, loading: ordersLoading } = useQuery(MY_ORDERS);
  // Refetched on every visit, so a check-in just completed shows up straight away.
  const { data: journeyData } = useQuery(MY_WEIGHT_JOURNEY, { fetchPolicy: 'cache-and-network' });
  const journey = journeyData?.myWeightJourney;

  const consultations = consultData?.myConsultations ?? [];
  const needsInfo = consultations.some((c: any) => c.status === 'MORE_INFO_REQUESTED');
  const hasActiveConsultation = consultations.some((c: any) => c.status !== 'DECLINED');
  const currentOrder = (ordersData?.myOrders ?? []).find((o: any) => o.status !== 'CANCELLED') ?? null;

  const loading = consultLoading || ordersLoading;
  const firstName = nameData?.me?.firstName;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h1>
          <p className="text-sm text-slate-500">Here’s where things stand.</p>
        </div>
        <ManageSubscriptionButton />
      </div>

      <div className="space-y-2 mb-4">
        {!loading && needsInfo && (
          <Notice tone="warn" title="Your clinician needs more information." text="Check your messages, then update your answers." href="/onboarding/medical-questionnaire?from=dashboard" action="Update answers →" />
        )}
        {/* Declined consultations are refunded, so starting over goes through support. */}
        {!loading && consultations.length > 0 && !hasActiveConsultation && (
          <Notice tone="info" title="Your consultation was declined." text="Your clinician’s message explains why." href="/messages" action="Messages →" />
        )}
        {!loading && consultations.length === 0 && (
          <Notice tone="info" title="Complete your medical questionnaire." text="A doctor reviews it before prescribing." href="/onboarding/medical-questionnaire?from=dashboard" action="Start →" />
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        {journey && <div className="lg:col-span-2"><WeightJourneyCard journey={journey} trend /></div>}
        <TodayCard journey={journey} />
        <div className="lg:col-span-2"><TreatmentCard order={currentOrder} /></div>
        <CareTeamCard />
      </div>
    </div>
  );
}
