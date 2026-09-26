'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@apollo/client';
import Link from 'next/link';
import PhotoUploadField from '@/components/onboarding/PhotoUploadField';
import { SAVE_IDENTITY_STEP, MY_ONBOARDING } from '@/graphql/onboarding';

export default function IdPhotoStepPage() {
  const router = useRouter();
  const [idDocumentFileId, setIdDocumentFileId] = useState<string | null>(null);
  const [selfieFileId, setSelfieFileId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [saveIdentityStep, { loading }] = useMutation(SAVE_IDENTITY_STEP, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  const canContinue = !!idDocumentFileId && !!selfieFileId;

  const handleContinue = async () => {
    if (!canContinue) return;
    setError('');
    try {
      await saveIdentityStep({ variables: { input: { idDocumentFileId, selfieFileId } } });
      router.push('/onboarding');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  return (
    <div>
      <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>

      <h1 className="text-xl font-bold text-slate-900 mt-4">Verify your identity</h1>
      <p className="text-sm text-slate-500 mt-2">
        This is legally required before we can prescribe and is only used for this verification.
      </p>

      <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mt-5 mb-6">
        <p className="text-xs font-semibold text-slate-700 mb-2">Before you start</p>
        <ul className="space-y-1.5 text-xs text-slate-600">
          <li>✓ Have a valid ID ready (e.g. passport, driving licence)</li>
          <li>✓ Find a well-lit spot for your selfie</li>
        </ul>
      </div>

      <div className="space-y-4">
        <PhotoUploadField
          kind="ID_DOCUMENT"
          label="Government ID"
          hint="Passport or driving licence, all corners visible"
          onUploaded={setIdDocumentFileId}
        />
        <PhotoUploadField
          kind="SELFIE"
          label="Selfie"
          hint="Look directly at the camera"
          onUploaded={setSelfieFileId}
        />
      </div>

      {error && <p className="text-xs text-danger-500 mt-3">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={!canContinue || loading}
        className="w-full mt-6 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
      >
        {loading ? 'Saving…' : 'Continue'}
      </button>
    </div>
  );
}
