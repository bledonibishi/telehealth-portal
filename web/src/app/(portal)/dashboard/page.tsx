'use client';

import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { format } from 'date-fns';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { MY_ORDERS } from '@/graphql/orders';
import { ME_NAME } from '@/graphql/patient';

const STAGES = ['Prescribed', 'Dispatched', 'Out for delivery', 'Delivered'] as const;
const STAGE_OF: Record<string, number> = { PENDING: 0, DISPATCHED: 1, OUT_FOR_DELIVERY: 2, DELIVERED: 3 };

function OrderTracker({ current }: { current: number }) {
  return (
    <div className="flex items-center">
      {STAGES.map((stage, i) => (
        <div key={stage} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div
              className={`w-3 h-3 rounded-full ${i <= current ? 'bg-brand-600' : 'bg-slate-200'} ${i === current ? 'ring-4 ring-brand-100' : ''}`}
            />
            <span className={`text-[11px] mt-1.5 whitespace-nowrap ${i <= current ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
              {stage}
            </span>
          </div>
          {i < STAGES.length - 1 && <div className={`h-0.5 flex-1 mx-1.5 mb-4 ${i < current ? 'bg-brand-600' : 'bg-slate-200'}`} />}
        </div>
      ))}
    </div>
  );
}

const QUICK_LINKS = [
  { href: '/consultations', icon: '📋', label: 'My consultations', hint: 'See the status of your treatment requests' },
  { href: '/messages', icon: '💬', label: 'Messages', hint: 'Talk to your clinical team' },
  { href: '/prescription', icon: '💊', label: 'Prescriptions & orders', hint: 'Full history and delivery tracking' },
];

export default function DashboardPage() {
  const { data: nameData } = useQuery(ME_NAME);
  const { data: consultData, loading: consultLoading } = useQuery(MY_CONSULTATIONS);
  const { data: ordersData, loading: ordersLoading } = useQuery(MY_ORDERS);

  const consultations = consultData?.myConsultations ?? [];
  const needsInfo = consultations.some((c: any) => c.status === 'MORE_INFO_REQUESTED');
  const hasActiveConsultation = consultations.some((c: any) => c.status !== 'DECLINED');

  const orders = ordersData?.myOrders ?? [];
  const currentOrder = orders.find((o: any) => o.status !== 'CANCELLED');
  const stage = currentOrder ? (STAGE_OF[currentOrder.status] ?? 0) : 0;

  const loading = consultLoading || ordersLoading;
  const firstName = nameData?.me?.firstName;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h1>
        <p className="text-sm text-slate-500 mt-1">Here&rsquo;s where things stand with your treatment.</p>
      </div>

      {!loading && needsInfo && (
        <div className="mb-4 bg-orange-50 border border-orange-100 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Your clinician needs more information</p>
            <p className="text-xs text-slate-500 mt-0.5">Check your messages, then update your medical questionnaire.</p>
          </div>
          <Link href="/onboarding/medical-questionnaire?from=dashboard" className="flex-shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700">
            Update answers →
          </Link>
        </div>
      )}

      {/* Declined consultations are refunded, so starting over goes through support. */}
      {!loading && consultations.length > 0 && !hasActiveConsultation && (
        <div className="mb-4 bg-white rounded-2xl border border-slate-100 p-6">
          <p className="text-slate-900 text-sm font-medium">Your consultation was declined</p>
          <p className="text-slate-500 text-sm mt-1">
            Your clinician&rsquo;s message explains why. If you&rsquo;d like to talk it through, message us.
          </p>
          <Link href="/messages" className="inline-block mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">
            Go to messages →
          </Link>
        </div>
      )}

      {!loading && consultations.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center mb-4">
          <p className="text-slate-900 text-sm font-medium">Complete your medical questionnaire</p>
          <p className="text-slate-400 text-sm mt-1">A doctor reviews your answers before prescribing.</p>
          <Link
            href="/onboarding/medical-questionnaire?from=dashboard"
            className="inline-block mt-4 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            Start questionnaire
          </Link>
        </div>
      )}

      {!loading && currentOrder && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-4">
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Track your order</p>
              <h3 className="text-lg font-semibold text-slate-900 mt-1">{currentOrder.prescription.medication}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {currentOrder.sequence === 1 ? 'First supply' : `Repeat ${currentOrder.sequence - 1}`}
                {currentOrder.dispatchedAt && ` · Dispatched ${format(new Date(currentOrder.dispatchedAt), 'dd MMM yyyy')}`}
              </p>
            </div>
            <Link href="/prescription" className="flex-shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700">
              Details →
            </Link>
          </div>

          <OrderTracker current={stage} />

          {currentOrder.trackingUrl && (
            <a
              href={currentOrder.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-4 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Track package →
            </a>
          )}
          {typeof currentOrder.prescription.repeatsRemaining === 'number' && currentOrder.prescription.repeatsRemaining > 0 && (
            <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
              {currentOrder.prescription.repeatsRemaining} repeat{currentOrder.prescription.repeatsRemaining === 1 ? '' : 's'} left on this prescription
            </p>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        {QUICK_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="bg-white rounded-2xl border border-slate-100 p-5 hover:border-brand-200 hover:shadow-sm transition-all"
          >
            <span className="text-xl">{l.icon}</span>
            <p className="text-sm font-semibold text-slate-900 mt-2">{l.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{l.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
