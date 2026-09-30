'use client';

import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { GET_CONSULTATION } from '@/graphql/consultations';
import { RedFlagBanner } from './RedFlagBanner';
import { DecisionPanel } from './DecisionPanel';
import { MessageThread } from './MessageThread';
import { PatientHistory } from './PatientHistory';
import { PrescriptionCard } from './PrescriptionCard';
import { OnboardingSummary } from './OnboardingSummary';
import { getToken } from '@/lib/auth';
import { formatDistanceToNow } from 'date-fns';

function parseJwtPayload(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

// Answers carry the questionnaire they came from (website eligibility screen,
// then the medical intake); older consultations have no section.
function groupBySection(answers: any[]): [string, any[]][] {
  const groups = new Map<string, any[]>();
  for (const a of answers) {
    const key = a.section ?? 'Quiz answers';
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups.entries()];
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
      <div>
        <Link href="/queue" className="text-xs text-gray-400 hover:text-gray-600">
          ← Back to queue
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {c.patient.firstName} {c.patient.lastName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {c.kind} · submitted {formatDistanceToNow(new Date(c.submittedAt), { addSuffix: true })}
            {c.questionnaireVersion && <span className="text-gray-400"> · {c.questionnaireVersion}</span>}
          </p>
        </div>
        <span className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-600">
          {c.status.replace(/_/g, ' ')}
        </span>
      </div>

      <RedFlagBanner redFlags={c.redFlags} />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {groupBySection(c.quizAnswers ?? []).map(([section, answers]) => (
            <section key={section} className="bg-white rounded-lg border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-900">{section}</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {answers.map((a: any) => (
                  <div key={a.questionId} className="px-4 py-3">
                    <p className="text-xs text-gray-500">{a.question}</p>
                    <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{a.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <DecisionPanel
            consultationId={c.id}
            kind={c.kind}
            status={c.status}
            declineReason={c.declineReason}
            refundStatus={c.refundStatus}
            clinician={c.clinician}
            currentUserId={currentUserId}
          />

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

          <OnboardingSummary patientId={c.patient.id} />

          {c.prescription && <PrescriptionCard prescription={c.prescription} patientId={c.patient.id} />}

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Prior consultations</h3>
            <PatientHistory patientId={c.patient.id} excludeId={c.id} />
          </div>
        </aside>
      </div>
    </div>
  );
}
