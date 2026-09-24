'use client';

import { useQuery } from '@apollo/client';
import { formatDistanceToNow } from 'date-fns';
import { MY_CONSULTATIONS } from '@/graphql/consultations';

export default function PrescriptionPage() {
  const { data, loading } = useQuery(MY_CONSULTATIONS);
  const withPrescription = (data?.myConsultations ?? []).filter((c: any) => c.prescription);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Prescriptions</h1>
        <p className="text-sm text-slate-500 mt-1">All prescriptions issued by your clinician.</p>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}

      {!loading && withPrescription.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <p className="text-slate-400 text-sm">No prescriptions issued yet.</p>
        </div>
      )}

      <div className="space-y-4">
        {withPrescription.map((c: any) => (
          <div key={c.id} className="bg-white rounded-2xl border border-green-100 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                  {c.kind}
                </span>
                <h3 className="text-lg font-semibold text-slate-900 mt-1">
                  {c.prescription.medication}
                </h3>
              </div>
              <span className="text-xs font-medium bg-green-100 text-green-700 px-3 py-1 rounded-full">
                Active
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Dosage</dt>
                <dd className="text-slate-800 font-medium">{c.prescription.dosage}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 mb-0.5">Issued</dt>
                <dd className="text-slate-800">
                  {formatDistanceToNow(new Date(c.prescription.issuedAt), { addSuffix: true })}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
