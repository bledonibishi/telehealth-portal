'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import { MY_ONBOARDING, SUBMIT_ONBOARDING } from '@/graphql/onboarding';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { ME_BASIC_INFO } from '@/graphql/patient';

type StepKey = 'basic-information' | 'medical-questionnaire' | 'id-photo' | 'body-photo' | 'prescription-proof';

const STEP_REJECTION_KEY: Partial<Record<StepKey, string>> = {
  'id-photo': 'ID_PHOTO',
  'body-photo': 'BODY_PHOTO',
  'prescription-proof': 'PRESCRIPTION_PROOF',
};

export default function OnboardingLandingPage() {
  const router = useRouter();
  const { data, loading } = useQuery(MY_ONBOARDING, { fetchPolicy: 'network-only' });
  const { data: consultationsData, loading: consultationsLoading } = useQuery(MY_CONSULTATIONS, { fetchPolicy: 'network-only' });
  const { data: meData, loading: meLoading } = useQuery(ME_BASIC_INFO, { fetchPolicy: 'network-only' });
  const [submitOnboarding, { loading: submitting }] = useMutation(SUBMIT_ONBOARDING, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  const o = data?.myOnboarding;
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (o?.status === 'APPROVED') router.replace('/dashboard');
  }, [o?.status, router]);

  if (loading || consultationsLoading || meLoading || !o) {
    return <p className="text-sm text-slate-400 text-center py-12">Loading…</p>;
  }

  const idPhotoDone = !!o.idDocumentUrl && !!o.selfieUrl;
  const bodyPhotoDone = !!o.bodyPhotoFrontUrl && !!o.bodyPhotoSideUrl;
  // Photos are saved one at a time, so a step can be half done: say which part is left.
  const idHave = [o.idDocumentUrl, o.selfieUrl].filter(Boolean).length;
  const bodyHave = [o.bodyPhotoFrontUrl, o.bodyPhotoSideUrl].filter(Boolean).length;
  const idPhotoHint = idHave === 1 ? (o.idDocumentUrl ? 'ID saved — your selfie is left' : 'Selfie saved — your ID is left') : 'A government ID and a selfie';
  const bodyPhotoHint = bodyHave === 1 ? (o.bodyPhotoFrontUrl ? 'Front photo saved — your side photo is left' : 'Side photo saved — your front photo is left') : 'Two full body photos, front and side';
  const prescriptionProofDone = o.priorMedicationUse === false || (!!o.priorMedicationUse && !!o.prescriptionProofUrl);

  const stepFeedback: { step: string; reason: string }[] = o.stepFeedback ?? [];
  const retakeViews: string[] = o.bodyPhotosToRetake ?? [];
  const feedbackFor = (key: StepKey) =>
    key === 'medical-questionnaire'
      ? questionnaireFeedback
      : key === 'body-photo' && retakeViews.length
        ? `Please retake your ${retakeViews.map((v) => (v === 'FRONT' ? 'front' : 'side')).join(' and ')} photo — it hasn’t passed our photo check`
        : STEP_REJECTION_KEY[key] && stepFeedback.find((f) => f.step === STEP_REJECTION_KEY[key])?.reason;

  // The questionnaire creates the consultation a doctor reviews.
  const consultations: { status: string }[] = consultationsData?.myConsultations ?? [];
  const questionnaireDone = consultations.some((c) => c.status !== 'DECLINED');
  const questionnaireFeedback = consultations.some((c) => c.status === 'MORE_INFO_REQUESTED')
    ? 'A clinician has asked for more information — please review your answers'
    : undefined;

  const baseSteps: { key: StepKey; label: string; hint: string; done: boolean }[] = [
    {
      key: 'basic-information',
      label: 'Basic information',
      hint: 'Your details and where we send your treatment',
      done: !!(meData?.me?.addressLine1 && meData?.me?.city && meData?.me?.postcode && meData?.me?.phone),
    },
    {
      key: 'medical-questionnaire',
      label: 'Medical questionnaire',
      hint: 'Your health, medicines and measurements',
      done: questionnaireDone,
    },
    { key: 'id-photo', label: 'ID Photo', hint: idPhotoHint, done: idPhotoDone },
    { key: 'body-photo', label: 'Full body photo', hint: bodyPhotoHint, done: bodyPhotoDone },
    {
      key: 'prescription-proof',
      label: 'Proof of prescription',
      hint: 'Only if you’ve used this medication before',
      done: prescriptionProofDone,
    },
  ];

  const steps = baseSteps.map((s) => ({ ...s, rejectionReason: feedbackFor(s.key), needsChanges: !!feedbackFor(s.key) }));

  const firstIncomplete = steps.find((s) => !s.done || s.needsChanges);
  const allDone = !firstIncomplete;

  if (o.status === 'PENDING_REVIEW') {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 rounded-full bg-ink-50 text-ink-700 flex items-center justify-center text-2xl mx-auto mb-4">⏳</div>
        <h1 className="text-xl font-bold text-slate-900">Under review</h1>
        <p className="text-sm text-slate-500 mt-2">
          Thanks — your documents are with our clinical team. We&rsquo;ll notify you as soon as they&rsquo;re reviewed.
        </p>
      </div>
    );
  }

  const handleSubmit = async () => {
    setSubmitError('');
    try {
      await submitOnboarding();
    } catch (err: any) {
      setSubmitError(err.message ?? 'We couldn’t submit your application. Please try again.');
    }
  };

  return (
    <div>
      {o.status === 'REJECTED' && (
        <div className="mb-5 bg-danger-50 border border-danger-100 text-danger-500 rounded-xl px-4 py-3 text-sm">
          <p className="font-medium">Your submission needs another look</p>
          <p className="mt-1 text-danger-500/90">See the step below marked in red for what to fix.</p>
        </div>
      )}

      <span className="inline-block text-xs font-semibold text-ink-800 bg-ink-50 border border-ink-100 rounded-full px-3 py-1 mb-4">
        About 6 minutes
      </span>

      <h1 className="text-2xl font-bold text-slate-900">You&rsquo;re almost there</h1>
      <p className="text-sm text-slate-500 mt-2">We need a few final details to meet clinical and regulatory requirements.</p>

      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-8 mb-3">What&rsquo;s left</p>

      <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
        {steps.map((s, i) => (
          <button
            key={s.key}
            onClick={() => router.push(`/onboarding/${s.key}`)}
            className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 transition-colors"
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                s.needsChanges
                  ? 'bg-danger-50 text-danger-500'
                  : s.done
                    ? 'bg-ink-50 text-ink-700'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {s.needsChanges ? '!' : s.done ? '✓' : i + 1}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">{s.label}</p>
              <p className={`text-xs ${s.needsChanges ? 'text-danger-500 font-medium' : 'text-slate-400'}`}>
                {s.needsChanges ? s.rejectionReason : s.hint}
              </p>
            </div>
            <span className="text-slate-300">›</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400 text-center mt-6">
        Your progress is saved as you go — you can leave and pick up where you stopped. A clinician reviews every application personally.
      </p>

      {submitError && <p role="alert" className="mt-6 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">{submitError}</p>}

      <button
        onClick={() => (allDone ? handleSubmit() : router.push(`/onboarding/${firstIncomplete!.key}`))}
        disabled={submitting}
        className="w-full mt-8 bg-ink-700 hover:bg-ink-800 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
      >
        {submitting ? 'Submitting…' : allDone ? 'Submit for review' : 'Resume'}
        {!submitting && <span>›</span>}
      </button>
    </div>
  );
}
