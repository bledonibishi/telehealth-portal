'use client';

import { PageHeader } from '@/components/portal/PageHeader';
import { EmptyState } from '@/components/portal/EmptyState';
import { useQuery } from '@apollo/client';
import { format, formatDistanceToNow } from 'date-fns';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { BloodTestsCard } from '@/components/labs/BloodTestsCard';

const STAGES = ['Prescribed', 'Dispatched', 'Out for delivery', 'Delivered'] as const;

function stageIndex(rx: any): number {
  if (rx.deliveredAt) return 3;
  if (rx.outForDeliveryAt) return 2;
  if (rx.dispatchedAt) return 1;
  return 0;
}

const STATUS_LABEL: Record<number, string> = {
  0: 'Preparing',
  1: 'Dispatched',
  2: 'Out for delivery',
  3: 'Delivered',
};

const STATUS_CLASS: Record<number, string> = {
  0: 'bg-amber-100 text-amber-700',
  1: 'bg-ink-100 text-ink-800',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-green-100 text-green-700',
};

function OrderTracker({ prescription }: { prescription: any }) {
  const current = stageIndex(prescription);

  return (
    <div className="flex items-center">
      {STAGES.map((stage, i) => (
        <div key={stage} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div
              className={`w-3 h-3 rounded-full ${
                i <= current ? 'bg-ink-700' : 'bg-slate-200'
              } ${i === current ? 'ring-4 ring-ink-100' : ''}`}
            />
            <span className={`text-[11px] mt-1.5 whitespace-nowrap ${i <= current ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
              {stage}
            </span>
          </div>
          {i < STAGES.length - 1 && (
            <div className={`h-0.5 flex-1 mx-1.5 mb-4 ${i < current ? 'bg-ink-700' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function PrescriptionPage() {
  const { data, loading } = useQuery(MY_CONSULTATIONS);
  const withPrescription = (data?.myConsultations ?? []).filter((c: any) => c.prescription);

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-4xl">
      <PageHeader title="Prescriptions" subtitle="Everything your clinician has prescribed, and where it’s up to." />

      <BloodTestsCard />

      {loading && <p className="text-sm text-slate-400">Loading…</p>}

      {!loading && withPrescription.length === 0 && (
        <EmptyState icon="rx" what="Your prescription" whenTreating={{ text: 'Your prescription has been issued and will show here in a moment. The PDF is under Documents.', action: { href: '/documents', label: 'Open Documents' } }} />
      )}

      <div className="space-y-4">
        {withPrescription.map((c: any) => {
          const rx = c.prescription;
          const stage = stageIndex(rx);
          return (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-100 p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <span className="text-xs font-semibold text-ink-800 uppercase tracking-wide">{c.kind}</span>
                  <h3 className="text-lg font-semibold text-slate-900 mt-1">{rx.medication}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{rx.dosage}</p>
                </div>
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_CLASS[stage]}`}>
                  {STATUS_LABEL[stage]}
                </span>
              </div>

              <OrderTracker prescription={rx} />

              <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
                <span>Prescribed {formatDistanceToNow(new Date(rx.issuedAt), { addSuffix: true })}</span>
                {rx.dispatchedAt && <span>Dispatched {format(new Date(rx.dispatchedAt), 'dd MMM yyyy')}</span>}
                {rx.outForDeliveryAt && <span>Out for delivery {format(new Date(rx.outForDeliveryAt), 'dd MMM yyyy')}</span>}
                {rx.deliveredAt && <span>Delivered {format(new Date(rx.deliveredAt), 'dd MMM yyyy')}</span>}
                {rx.pharmacyRef && (
                  <span>
                    Ref: <span className="font-mono text-slate-500">{rx.pharmacyRef}</span>
                  </span>
                )}
              </div>

              {rx.trackingUrl && (
                <a
                  href={rx.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-3 text-xs font-medium text-ink-700 hover:text-ink-800"
                >
                  Track package →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
