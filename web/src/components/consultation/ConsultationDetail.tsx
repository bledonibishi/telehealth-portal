'use client';

import { useQuery } from '@apollo/client';
import { GET_CONSULTATION } from '@/graphql/consultations';
import { RedFlagBanner } from './RedFlagBanner';
import { DecisionPanel } from './DecisionPanel';
import { MessageThread } from './MessageThread';
import { getToken } from '@/lib/auth';
import { formatDistanceToNow } from 'date-fns';

function parseJwtPayload(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function ConsultationDetail({ id }: { id: string }) {
  const { data, loading, error } = useQuery(GET_CONSULTATION, { variables: { id } });

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  if (error) return <p className="p-6 text-sm text-danger-500">{error.message}</p>;

  const c = data?.consultation;
  if (!c) return null;

  const token = getToken();
  const currentUserId = token ? parseJwtPayload(token)?.sub : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {c.patient.firstName} {c.patient.lastName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {c.kind} · submitted {formatDistanceToNow(new Date(c.submittedAt), { addSuffix: true })}
          </p>
        </div>
        <span className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-600">
          {c.status.replace(/_/g, ' ')}
        </span>
      </div>

      <RedFlagBanner redFlags={c.redFlags} />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <section className="bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Quiz answers</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {(c.quizAnswers ?? []).map((a: any, i: number) => (
                <div key={i} className="px-4 py-3">
                  <p className="text-xs text-gray-500">{a.question}</p>
                  <p className="text-sm text-gray-900 mt-1">{a.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <DecisionPanel consultationId={c.id} status={c.status} />

          <MessageThread consultationId={c.id} currentUserId={currentUserId} />
        </div>

        <aside className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Patient</h3>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-gray-500">Email</dt><dd>{c.patient.email}</dd></div>
              <div>
                <dt className="text-gray-500">Date of birth</dt>
                <dd>{new Date(c.patient.dateOfBirth).toLocaleDateString('en-GB')}</dd>
              </div>
            </dl>
          </div>

          {c.prescription && (
            <div className="bg-white rounded-lg border border-green-200 p-4">
              <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">Prescription issued</h3>
              <dl className="space-y-2 text-sm">
                <div><dt className="text-gray-500">Medication</dt><dd>{c.prescription.medication}</dd></div>
                <div><dt className="text-gray-500">Dosage</dt><dd>{c.prescription.dosage}</dd></div>
                <div><dt className="text-gray-500">Instructions</dt><dd>{c.prescription.instructions}</dd></div>
                {c.prescription.pharmacyRef && (
                  <div><dt className="text-gray-500">Pharmacy ref</dt><dd>{c.prescription.pharmacyRef}</dd></div>
                )}
              </dl>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
