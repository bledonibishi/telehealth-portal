'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import { MY_ONBOARDING, SUBMIT_ONBOARDING } from '@/graphql/onboarding';

type StepKey = 'id-photo' | 'body-photo' | 'prescription-proof';

export default function OnboardingLandingPage() {
  const router = useRouter();
  const { data, loading } = useQuery(MY_ONBOARDING, { fetchPolicy: 'network-only' });
  const [submitOnboarding, { loading: submitting }] = useMutation(SUBMIT_ONBOARDING, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  const o = data?.myOnboarding;

  useEffect(() => {
    if (o?.status === 'APPROVED') router.replace('/dashboard');
  }, [o?.status, router]);

  if (loading || !o) {
    return <p className="text-sm text-slate-400 text-center py-12">Loading…</p>;
  }

  const idPhotoDone = !!o.idDocumentUrl && !!o.selfieUrl;
  const bodyPhotoDone = !!o.bodyPhotoFrontUrl && !!o.bodyPhotoSideUrl;
  const prescriptionProofDone = o.priorMedicationUse === false || (!!o.priorMedicationUse && !!o.prescriptionProofUrl);

  const steps: { key: StepKey; label: string; hint: string; done: boolean }[] = [
    { key: 'id-photo', label: 'ID Photo', hint: 'A government ID and a selfie', done: idPhotoDone },
    { key: 'body-photo', label: 'Full body photo', hint: 'Two full body photos, front and side', done: bodyPhotoDone },
    {
      key: 'prescription-proof',
      label: 'Proof of prescription',
      hint: 'Only if you’ve used this medication before',
      done: prescriptionProofDone,
    },
  ];

  const firstIncomplete = steps.find((s) => !s.done);
  const allDone = !firstIncomplete;

  if (o.status === 'PENDING_REVIEW') {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-2xl mx-auto mb-4">⏳</div>
        <h1 className="text-xl font-bold text-slate-900">Under review</h1>
        <p className="text-sm text-slate-500 mt-2">
          Thanks — your documents are with our clinical team. We&rsquo;ll notify you as soon as they&rsquo;re reviewed.
        </p>
      </div>
    );
  }

  const handleSubmit = async () => {
    await submitOnboarding();
  };

  return (
    <div>
      {o.status === 'REJECTED' && (
        <div className="mb-5 bg-danger-50 border border-danger-100 text-danger-500 rounded-xl px-4 py-3 text-sm">
          <p className="font-medium">Your submission needs another look</p>
          {o.rejectionReason && <p className="mt-1 text-danger-500/90">{o.rejectionReason}</p>}
        </div>
      )}

      <span className="inline-block text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-3 py-1 mb-4">
        About 6 minutes
      </span>

      <h1 className="text-2xl font-bold text-slate-900">You&rsquo;re almost there</h1>
      <p className="text-sm text-slate-500 mt-2">We need a few final details to meet clinical and regulatory requirements.</p>

      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-8 mb-3">What&rsquo;s left</p>

      <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-sm flex-shrink-0">✓</div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">Basic information</p>
            <p className="text-xs text-slate-400">Completed</p>
          </div>
        </div>

        {steps.map((s, i) => (
          <button
            key={s.key}
            onClick={() => router.push(`/onboarding/${s.key}`)}
            className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 transition-colors"
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                s.done ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {s.done ? '✓' : i + 2}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">{s.label}</p>
              <p className="text-xs text-slate-400">{s.hint}</p>
            </div>
            <span className="text-slate-300">›</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400 text-center mt-6">
        Your data is encrypted. A clinician reviews every application personally.
      </p>

      <button
        onClick={() => (allDone ? handleSubmit() : router.push(`/onboarding/${firstIncomplete!.key}`))}
        disabled={submitting}
        className="w-full mt-8 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
      >
        {submitting ? 'Submitting…' : allDone ? 'Submit for review' : 'Resume'}
        {!submitting && <span>›</span>}
      </button>
    </div>
  );
}
