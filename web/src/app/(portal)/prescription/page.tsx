'use client';

import { PageHeader } from '@/components/portal/PageHeader';
import { EmptyState } from '@/components/portal/EmptyState';
import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { BloodTestsCard } from '@/components/labs/BloodTestsCard';
import { LoadingState } from '@telehealth/loading';

export default function PrescriptionPage() {
  const { data, loading } = useQuery(MY_CONSULTATIONS);
  const withPrescription = (data?.myConsultations ?? []).filter((c: any) => c.prescription);

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-4xl">
      <PageHeader title="Prescriptions" subtitle="Everything your clinician has prescribed. Deliveries are under Orders." />

      <BloodTestsCard />

      {loading && <LoadingState variant="inline" label="Loading…" />}

      {!loading && withPrescription.length === 0 && (
        <EmptyState icon="rx" what="Your prescription" whenTreating={{ text: 'Your prescription has been issued and will show here in a moment. The PDF is under Documents.', action: { href: '/documents', label: 'Open Documents' } }} />
      )}

      <div className="space-y-4">
        {withPrescription.map((c: any) => {
          const rx = c.prescription;
          return (
            <div key={c.id} className="bg-white rounded-lg border border-slate-100 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-xs font-semibold text-ink-800 uppercase tracking-wide">{c.kind}</span>
                  <h3 className="text-lg font-semibold text-slate-900 mt-1">{rx.medication}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{rx.dosage}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-slate-500">
                <span>Prescribed {format(new Date(rx.issuedAt), 'd MMM yyyy')} ({formatDistanceToNow(new Date(rx.issuedAt), { addSuffix: true })})</span>
                <Link href="/orders" className="font-semibold text-ink-600 hover:text-ink-800">Where is my delivery? →</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
