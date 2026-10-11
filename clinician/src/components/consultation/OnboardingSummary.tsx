'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { GET_ONBOARDING_SUBMISSION } from '@/graphql/onboarding';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { LoadingState } from '@telehealth/loading';

const STATUS: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  PENDING_REVIEW: { label: 'Awaiting review', cls: 'bg-yellow-100 text-yellow-800' },
  IN_PROGRESS: { label: 'Not submitted', cls: 'bg-gray-100 text-gray-600' },
  REJECTED: { label: 'Changes requested', cls: 'bg-danger-50 text-danger-500' },
  DECLINED: { label: 'Declined', cls: 'bg-danger-50 text-danger-500' },
};

// Where onboarding stands, beside the decision. What the patient sent (ID result, photos, proof) is the
// "Identity & onboarding" section of the consultation itself, so the reviewer decides on one page.
export function OnboardingSummary({ patientId }: { patientId: string }) {
  const { t } = useI18n();
  const { data, loading } = useQuery(GET_ONBOARDING_SUBMISSION, { variables: { patientId } });
  const o = data?.onboardingSubmission;
  const status = STATUS[o?.status ?? 'IN_PROGRESS'] ?? STATUS.IN_PROGRESS;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('Identity & onboarding')}</h3>
        {!loading && <span className={`text-xs font-medium px-2 py-0.5 rounded ${status.cls}`}>{t(status.label)}</span>}
      </div>

      {loading && <LoadingState variant="inline" label={t('Loading…')} />}
      {!loading && !o && <p className="text-xs text-gray-500">{t('The patient hasn’t started onboarding.')}</p>}

      {!loading && o?.status === 'PENDING_REVIEW' && (
        <p className="text-xs text-gray-600 bg-gray-50 rounded p-2">{t('Approving this consultation approves their onboarding too. If something needs fixing, use “Ask to redo a step”.')}</p>
      )}
      {!loading && o?.status === 'REJECTED' && (
        <p className="text-xs text-warn-900 bg-warn-50 rounded p-2">{t('Waiting for the patient to redo the steps you asked them to.')}</p>
      )}
      {!loading && (!o || o.status === 'IN_PROGRESS') && (
        <p className="text-xs text-warn-900 bg-warn-50 rounded p-2">{t('You can decide once the patient has finished onboarding.')}</p>
      )}
      <Link href={`/patients?patient=${patientId}`} className="block text-xs font-medium text-brand-500 hover:underline">
        {t('Open patient file →')}
      </Link>
    </div>
  );
}
