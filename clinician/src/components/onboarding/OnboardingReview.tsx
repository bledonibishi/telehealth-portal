'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';
import { ProofReviewCard } from '@/components/onboarding/ProofReviewCard';
import { PhotoTile } from '@/components/PhotoTile';

const PROOF_TYPE_LABEL: Record<string, string> = {
  MEDICINE_BOX_LABEL: 'Medicine box label',
  PRESCRIPTION_DOCUMENT: 'Prescription document',
  PHARMACY_RECORD: 'Pharmacy record',
  ORDER_CONFIRMATION: 'Order confirmation',
};

function OnboardingStepSection({
  title,
  savedDecision,
  children,
}: {
  title: string;
  savedDecision?: { approved: boolean; reason?: string };
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-900">{t(title)}</h4>
        {savedDecision && !savedDecision.approved && (
          <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">{t('Changes requested')}</span>
        )}
        {savedDecision && savedDecision.approved && (
          <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{t('Approved')}</span>
        )}
      </header>

      <div className="p-4 space-y-3">
        {children}
        {savedDecision && !savedDecision.approved && savedDecision.reason && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{savedDecision.reason}</p>
        )}
      </div>
    </section>
  );
}

const PHOTO_ISSUE: Record<string, string> = {
  NO_PERSON: 'No person visible',
  MULTIPLE_PEOPLE: 'More than one person',
  FACE_NOT_VISIBLE: 'Face not clearly visible',
  NOT_FULL_BODY: 'Not full body',
  TOO_FAR: 'Too far from the camera',
  BAGGY_CLOTHING: 'Baggy or heavy clothing',
  WRONG_ANGLE: 'Wrong angle',
  POOR_QUALITY: 'Too dark or blurry',
  NOT_A_REAL_PHOTO: 'Photo of a screen or print',
};

/**
 * What the automatic photo check made of each body photo, as a first pass for the reviewer: it never replaces
 * the review. A photo the patient sent after the check turned it away (FAIL) is flagged, since they asked for a person to look.
 */
function PhotoCheckNotes({ checks }: { checks: Array<{ view: string; outcome: string; issues: string[] }> }) {
  const { t } = useI18n();
  if (!checks.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {checks.map((c) => (
        <li key={c.view} className={`text-xs ${c.outcome === 'FAIL' ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
          {c.view === 'FRONT' ? t('Front') : t('Side')}:{' '}
          {c.outcome === 'PASS' && t('automatic check passed')}
          {c.outcome === 'UNCHECKED' && t('not checked automatically')}
          {c.outcome === 'FAIL' && `${t('failed the automatic check — sent for your review')}${c.issues.length ? ` (${c.issues.map((i) => t(PHOTO_ISSUE[i] ?? i)).join(', ')})` : ''}`}
        </li>
      ))}
    </ul>
  );
}

/**
 * Everything a clinician needs to decide on a patient's onboarding, as the patient sent it: the identity result,
 * the ID and body photos with the automatic photo check, and any proof of a previous prescription with what the
 * automatic check made of it. Read-only: the decision is the consultation's, made on the consultation page.
 */
export function OnboardingReview({ onboarding }: { onboarding: any }) {
  const { t, timeAgo } = useI18n();
  const savedStepDecision = (step: string) =>
    onboarding?.stepFeedback?.find((f: { step: string; approved: boolean; reason?: string }) => f.step === step);
  return (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      onboarding.status === 'PENDING_REVIEW'
                        ? 'bg-amber-50 text-amber-700'
                        : onboarding.status === 'APPROVED'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {t(onboarding.status.replace(/_/g, ' '))}
                  </span>
                  {onboarding.submittedAt && (
                    <span className="text-xs text-gray-400">
                      {t('Submitted {when}', { when: timeAgo(onboarding.submittedAt) })}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('Identity check')}</p>
                    <p className="text-sm text-gray-800">
                      {onboarding.personaStatus === 'NOT_CONFIGURED' ? t('Manual review') : t(onboarding.personaStatus.replace(/_/g, ' '))}
                      {onboarding.identityViaVerifyService && <span className="text-xs text-gray-400"> · {t('verification service')}</span>}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('Photo compliance')}</p>
                    <p className="text-sm text-gray-800">{t(onboarding.photoReviewStatus.replace(/_/g, ' '))}</p>
                  </div>
                </div>

                {(() => {
                  const stepProps = (step: string) => ({ savedDecision: savedStepDecision(step) });

                  return (
                    <>
                      {onboarding.identityViaVerifyService ? (
                        // The ID photos stay in the verification service and are decided there, so there is
                        // nothing for a clinician to approve here: approval waits for that result instead.
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('ID document & selfie')}</p>
                          <p className="text-sm text-gray-700">
                            {onboarding.personaStatus === 'VERIFIED'
                              ? t('Identity verified by the verification service.')
                              : onboarding.personaStatus === 'FAILED'
                                ? t('Identity could not be verified. The patient has been asked to try again.')
                                : t('Identity is being checked by the verification service. Approval waits for that result.')}
                          </p>
                        </div>
                      ) : (
                        <OnboardingStepSection title="ID document & selfie" {...stepProps('ID_PHOTO')}>
                          <div className="grid grid-cols-2 gap-3">
                            <PhotoTile path={onboarding.idDocumentUrl} caption={t('ID document')} />
                            <PhotoTile path={onboarding.selfieUrl} caption={t('Selfie')} />
                          </div>
                        </OnboardingStepSection>
                      )}

                      <OnboardingStepSection title="Full body photos" {...stepProps('BODY_PHOTO')}>
                        <div className="grid grid-cols-2 gap-3">
                          <PhotoTile path={onboarding.bodyPhotoFrontUrl} caption={t('Front-facing')} height="h-64" />
                          <PhotoTile path={onboarding.bodyPhotoSideUrl} caption={t('Side-facing')} height="h-64" />
                        </div>
                        <PhotoCheckNotes checks={onboarding.bodyPhotoChecks ?? []} />
                      </OnboardingStepSection>

                      <OnboardingStepSection title="Prior medication use" {...stepProps('PRESCRIPTION_PROOF')}>
                        {!onboarding.priorMedicationUse ? (
                          <p className="text-sm text-gray-600">{t('No — first time using this medication.')}</p>
                        ) : (
                          <>
                            {onboarding.prescriptionProofUnavailable && (
                              <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2.5">
                                {t('Yes — but the patient has no proof. Start-dose rules apply unless you verify their previous dose another way (e.g. with their previous prescriber).')}
                              </p>
                            )}
                            {onboarding.prescriptionProofUrl ? (
                              // The document beside what the automatic check made of it. Still shown after
                              // "I don't have any proof", as the upload that came before it.
                              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start">
                                <PhotoTile
                                  path={onboarding.prescriptionProofUrl}
                                  height="h-72"
                                  caption={
                                    onboarding.prescriptionProofUnavailable
                                      ? t('Earlier upload, before they said they have no proof')
                                      : t(PROOF_TYPE_LABEL[onboarding.prescriptionProofType] ?? onboarding.prescriptionProofType ?? 'Prescription proof')
                                  }
                                />
                                {onboarding.prescriptionProofReview ? (
                                  <ProofReviewCard review={onboarding.prescriptionProofReview} />
                                ) : (
                                  <p className="text-xs text-gray-500">{t('Not checked automatically — review the document yourself.')}</p>
                                )}
                              </div>
                            ) : (
                              !onboarding.prescriptionProofUnavailable && <p className="text-sm text-gray-500">{t('No proof uploaded yet.')}</p>
                            )}
                          </>
                        )}
                      </OnboardingStepSection>

                    </>
                  );
                })()}
              </div>
  );
}
