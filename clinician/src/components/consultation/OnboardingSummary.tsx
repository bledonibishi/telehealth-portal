'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import AuthedImage from '@/components/AuthedImage';
import { RISK } from '@/components/onboarding/ProofReviewCard';
import { GET_ONBOARDING_SUBMISSION } from '@/graphql/onboarding';
import { useI18n } from '@/lib/i18n/I18nProvider';

const STATUS: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  PENDING_REVIEW: { label: 'Awaiting review', cls: 'bg-yellow-100 text-yellow-800' },
  IN_PROGRESS: { label: 'Not submitted', cls: 'bg-gray-100 text-gray-600' },
  REJECTED: { label: 'Changes requested', cls: 'bg-danger-50 text-danger-500' },
};

// Prescribing is blocked until onboarding is approved, so the reviewer needs
// to see where it stands (and the photos) without leaving the consultation.
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

      {loading && <p className="text-xs text-gray-400">{t('Loading…')}</p>}
      {!loading && !o && <p className="text-xs text-gray-500">{t('The patient hasn’t started onboarding.')}</p>}

      {o && (
        <>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div><dt className="text-gray-500">{t('ID check')}</dt><dd>{o.personaStatus.replace(/_/g, ' ').toLowerCase()}</dd></div>
            <div><dt className="text-gray-500">{t('Photos')}</dt><dd>{o.photoReviewStatus.replace(/_/g, ' ').toLowerCase()}</dd></div>
            <div className="col-span-2">
              <dt className="text-gray-500">{t('Prior use of this medicine')}</dt>
              <dd>
                {o.priorMedicationUse === null ? '—' : o.priorMedicationUse ? 'Yes' : 'No'}
                {o.priorMedicationUse &&
                  (o.prescriptionProofUnavailable ? ' · has no proof (start dose)' : o.prescriptionProofUrl ? ' · proof uploaded' : ' · no proof yet')}
                {o.priorMedicationUse && !o.prescriptionProofUnavailable && o.prescriptionProofReview && (
                  <span className={`ml-1.5 font-medium px-1.5 py-0.5 rounded ${RISK[o.prescriptionProofReview.riskLevel as keyof typeof RISK]?.cls ?? ''}`}>
                    {t(RISK[o.prescriptionProofReview.riskLevel as keyof typeof RISK]?.label ?? o.prescriptionProofReview.riskLevel)}
                    {o.prescriptionProofReview.suggestedDoseLabel &&
                      o.prescriptionProofReview.suggestedDoseLabel !== o.prescriptionProofReview.requestedDoseLabel &&
                      ` · ${t('safe next dose {dose}', { dose: o.prescriptionProofReview.suggestedDoseLabel })}`}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              // No ID photos here when the check ran in the verification service
              ...(o.identityViaVerifyService ? [] : [[o.idDocumentUrl, t('ID document')], [o.selfieUrl, t('Selfie')]]),
              [o.bodyPhotoFrontUrl, t('Body photo, front')],
              [o.bodyPhotoSideUrl, t('Body photo, side')],
            ].map(([path, alt]) => (
              <AuthedImage key={alt} path={path} alt={alt!} className="w-full h-16 object-cover rounded" />
            ))}
          </div>
        </>
      )}

      {o?.status !== 'APPROVED' && !loading && (
        <p className="text-xs text-warn-900 bg-warn-50 rounded p-2">{t('You can’t prescribe until onboarding is approved.')}</p>
      )}
      <Link href={`/patients?patient=${patientId}`} className="block text-xs font-medium text-brand-500 hover:underline">
        {t('Review documents →')}
      </Link>
    </div>
  );
}
