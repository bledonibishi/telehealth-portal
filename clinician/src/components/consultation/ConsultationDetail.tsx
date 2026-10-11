'use client';

import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { GET_CONSULTATION } from '@/graphql/consultations';
import { GET_ONBOARDING_SUBMISSION } from '@/graphql/onboarding';
import { OnboardingReview } from '@/components/onboarding/OnboardingReview';
import { RedFlagBanner } from './RedFlagBanner';
import { RiskBadge } from './RiskBadge';
import { DecisionPanel } from './DecisionPanel';
import { ChatDock } from './ChatDock';
import { PatientHistory } from './PatientHistory';
import { PrescriptionCard } from './PrescriptionCard';
import { OnboardingSummary } from './OnboardingSummary';
import { getToken } from '@/lib/auth';
import { differenceInYears, formatDistanceToNow } from 'date-fns';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { ErrorAlert } from '@/components/ui/Alert';
import { LoadingState } from '@telehealth/loading';

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

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'New', cls: 'bg-blue-50 text-blue-700' },
  IN_REVIEW: { label: 'In review', cls: 'bg-warn-50 text-warn-900' },
  MORE_INFO_REQUESTED: { label: 'Awaiting info', cls: 'bg-purple-50 text-purple-700' },
  APPROVED: { label: 'Approved', cls: 'bg-green-50 text-green-700' },
  DECLINED: { label: 'Declined', cls: 'bg-danger-50 text-danger-500' },
};

const initials = (first: string, last: string) => `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();

export function ConsultationDetail({ id }: { id: string }) {
  const { t, timeAgo, fmt } = useI18n();
  const { data, loading, error, refetch } = useQuery(GET_CONSULTATION, { variables: { id } });
  const patientId: string | undefined = data?.consultation?.patient?.id;
  // Shared with the decision panel and the side summary through the cache.
  const { data: onboardingData } = useQuery(GET_ONBOARDING_SUBMISSION, { variables: { patientId }, skip: !patientId });
  const onboarding = onboardingData?.onboardingSubmission;

  if (loading) return <LoadingState label={t('Loading…')} className="!py-6" />;
  if (error) return <ErrorAlert error={error} title={t('Could not load this consultation')} onRetry={() => refetch()} className="m-6" />;

  const c = data?.consultation;
  if (!c) return null;

  const token = getToken();
  const currentUserId = token ? parseJwtPayload(token)?.sub : null;
  const status = STATUS_STYLE[c.status] ?? { label: c.status.replace(/_/g, ' '), cls: 'bg-gray-100 text-gray-600' };
  const dob = new Date(c.patient.dateOfBirth);
  const fullName = `${c.patient.firstName} ${c.patient.lastName}`;

  return (
    <div className="h-full flex">
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Identity + decision stay in view while the questionnaire scrolls. */}
        <header className="shrink-0 bg-white border-b border-gray-200">
          <div className="px-4 sm:px-6 pt-3 pb-3">
            <Link href="/queue" className="text-xs text-gray-400 hover:text-gray-600">
              {t('← Review queue')}
            </Link>
            <div className="mt-2 flex items-center gap-4">
              <div className="w-11 h-11 rounded-full bg-brand-50 text-brand-900 font-semibold text-sm flex items-center justify-center shrink-0">
                {initials(c.patient.firstName, c.patient.lastName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="text-xl font-semibold text-gray-900 truncate">{fullName}</h1>
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${status.cls}`}>{t(status.label)}</span>
                  <RiskBadge tag={c.riskTag} />
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {t('{n} yrs', { n: differenceInYears(new Date(), dob) })} · {c.kind} · {t('submitted {when}', { when: timeAgo(c.submittedAt) })}
                  {c.questionnaireVersion && <span className="text-gray-400"> · {c.questionnaireVersion}</span>}
                </p>
              </div>
            </div>
          </div>

          <DecisionPanel
            consultationId={c.id}
            kind={c.kind}
            status={c.status}
            declineReason={c.declineReason}
            refundStatus={c.refundStatus}
            clinician={c.clinician}
            currentUserId={currentUserId}
            patientId={c.patient.id}
            blockedReason={c.decisionBlockedReason}
          />
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 sm:p-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
            <div className="space-y-5 min-w-0">
              <RedFlagBanner redFlags={c.redFlags} />

              {onboarding && onboarding.status !== 'IN_PROGRESS' && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-gray-900">{t('Identity & onboarding')}</h2>
                  <OnboardingReview onboarding={onboarding} />
                </section>
              )}

              {groupBySection(c.quizAnswers ?? []).map(([section, answers]) => (
                <section key={section} className="bg-white rounded-md border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-900">{t(section)}</h2>
                    <span className="text-xs text-gray-400">{answers.length === 1 ? t('1 answer') : t('{n} answers', { n: answers.length })}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {answers.map((a: any, i: number) => (
                      <div key={a.questionId} className="px-4 py-2.5 flex flex-wrap items-baseline gap-x-6 gap-y-0.5">
                        <p className="flex-1 basis-56 text-[13px] text-gray-500">
                          <span className="text-gray-300 mr-2 tabular-nums">{i + 1}</span>
                          {a.question}
                        </p>
                        <p className="flex-1 basis-40 text-sm font-medium text-gray-900 whitespace-pre-wrap">{a.answer}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <aside className="space-y-4 min-w-0">
              <div className="bg-white rounded-md border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('Patient')}</h3>
                <dl className="space-y-2.5 text-sm">
                  <div>
                    <dt className="text-xs text-gray-500">{t('Email')}</dt>
                    <dd className="break-all">
                      <a href={`mailto:${c.patient.email}`} className="hover:text-brand-500">{c.patient.email}</a>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{t('Date of birth')}</dt>
                    <dd>{fmt(dob, 'dd/MM/yyyy')} <span className="text-gray-400">· {t('{n} yrs', { n: differenceInYears(new Date(), dob) })}</span></dd>
                  </div>
                </dl>
              </div>

              <OnboardingSummary patientId={c.patient.id} />

              {c.prescription && <PrescriptionCard prescription={c.prescription} patientId={c.patient.id} />}

              <div className="bg-white rounded-md border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('Prior consultations')}</h3>
                <PatientHistory patientId={c.patient.id} excludeId={c.id} />
              </div>
            </aside>
          </div>
        </div>
      </div>

      <ChatDock key={c.patient.id} patientId={c.patient.id} patientName={fullName} currentUserId={currentUserId} />
    </div>
  );
}
