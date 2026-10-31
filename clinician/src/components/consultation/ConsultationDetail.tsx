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

// Answers that need no attention: a plain no or none. Everything else (a yes, a list, free text) is shown first.
const NOTHING_TO_NOTE = /^(no|none|none of the above|never|no, never|not applicable|n\/a|jo|asnjë|asnjë nga këto)\.?$/i;
// Already shown in the key numbers at the top.
const IN_KEY_FACTS = new Set(['weight_kg', 'height_cm', 'bmi_calculated']);

function AnswerRow({ a, highlight = false }: { a: any; highlight?: boolean }) {
  return (
    <div className="px-4 py-2.5 grid gap-x-6 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <p className="text-[13px] text-gray-500">{a.question}</p>
      <p className={`text-sm whitespace-pre-wrap ${highlight ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{a.answer}</p>
    </div>
  );
}

/**
 * The questionnaire for a doctor deciding: the answers worth reading first, then the rest (all a plain no or none) one click
 * away, grouped by section. Nothing is hidden that can't be opened, and nothing worth reading is folded away.
 */
function Answers({ answers }: { answers: any[] }) {
  const { t } = useI18n();
  const shown = answers.filter((a) => !IN_KEY_FACTS.has(a.questionId));
  const notable = shown.filter((a) => !NOTHING_TO_NOTE.test(String(a.answer ?? '').trim()));
  const rest = shown.filter((a) => NOTHING_TO_NOTE.test(String(a.answer ?? '').trim()));
  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <h2 className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t('Answers to look at')}<span className="font-normal normal-case tracking-normal text-gray-400">{notable.length}</span>
        </h2>
        {notable.length ? <div className="divide-y divide-gray-100">{notable.map((a) => <AnswerRow key={a.questionId} a={a} highlight />)}</div>
          : <p className="px-4 py-4 text-sm text-gray-500">{t('Every answer is a plain no or none.')}</p>}
      </section>
      {rest.length > 0 && (
        <details className="group overflow-hidden rounded-xl border border-gray-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm text-gray-700 hover:bg-gray-50">
            <span>{t('Other answers ({n}): all no or none', { n: rest.length })}</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </summary>
          <div className="border-t border-gray-100">
            {groupBySection(rest).map(([section, list]) => (
              <div key={section}>
                <p className="bg-gray-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t(section)}</p>
                <div className="divide-y divide-gray-100">{list.map((a) => <AnswerRow key={a.questionId} a={a} />)}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** The numbers a doctor checks first, read from the answers: age, weight, height and the BMI they make. */
function KeyFacts({ answers, age }: { answers: any[]; age: number }) {
  const { t } = useI18n();
  const num = (id: string) => {
    const v = parseFloat(String(answers.find((a) => a.questionId === id)?.answer ?? '').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  };
  const weight = num('weight_kg');
  const height = num('height_cm');
  const bmi = weight && height ? weight / ((height / 100) * (height / 100)) : null;
  const facts: Array<[string, string]> = [
    [t('Age'), t('{n} yrs', { n: age })],
    ...(weight ? [[t('Weight'), `${weight} kg`] as [string, string]] : []),
    ...(height ? [[t('Height'), `${height} cm`] as [string, string]] : []),
    ...(bmi ? [[t('BMI'), bmi.toFixed(1)] as [string, string]] : []),
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {facts.map(([label, value]) => (
        <div key={label} className="px-4 py-3">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-semibold tabular-nums text-gray-900">{value}</p>
        </div>
      ))}
    </div>
  );
}

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
        <header data-guide="consultation:header" className="shrink-0 bg-white border-b border-gray-200">
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
                  {' · '}<a href={`mailto:${c.patient.email}`} className="hover:text-brand-500">{c.patient.email}</a>
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
            criticalFlags={(c.redFlags ?? []).filter((f: any) => f.severity === 'CRITICAL').map((f: any) => f.description)}
          />
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 sm:p-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
            <div data-guide="consultation:answers" className="space-y-5 min-w-0">
              <KeyFacts answers={c.quizAnswers ?? []} age={differenceInYears(new Date(), dob)} />

              <RedFlagBanner redFlags={c.redFlags} />

              {/* Once approved, the side card says so; the full review only shows while it still needs deciding. */}
              {onboarding && onboarding.status !== 'IN_PROGRESS' && onboarding.status !== 'APPROVED' && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-gray-900">{t('Identity & onboarding')}</h2>
                  <OnboardingReview onboarding={onboarding} />
                </section>
              )}

              <Answers answers={c.quizAnswers ?? []} />
            </div>

            <aside data-guide="consultation:sidebar" className="space-y-4 min-w-0">
              <OnboardingSummary patientId={c.patient.id} />

              {c.prescription && <PrescriptionCard prescription={c.prescription} patientId={c.patient.id} />}

              <div className="bg-white rounded-xl border border-gray-200 p-4">
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
