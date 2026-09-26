'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@apollo/client';
import Link from 'next/link';
import PhotoUploadField from '@/components/onboarding/PhotoUploadField';
import { SAVE_BODY_PHOTOS_STEP, MY_ONBOARDING } from '@/graphql/onboarding';

export default function BodyPhotoStepPage() {
  const router = useRouter();
  const [frontFileId, setFrontFileId] = useState<string | null>(null);
  const [sideFileId, setSideFileId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [saveBodyPhotosStep, { loading }] = useMutation(SAVE_BODY_PHOTOS_STEP, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  const canContinue = !!frontFileId && !!sideFileId;

  const handleContinue = async () => {
    if (!canContinue) return;
    setError('');
    try {
      await saveBodyPhotosStep({
        variables: { input: { bodyPhotoFrontFileId: frontFileId, bodyPhotoSideFileId: sideFileId } },
      });
      router.push('/onboarding');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  return (
    <div>
      <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>

      <h1 className="text-xl font-bold text-slate-900 mt-4">Full body photos</h1>
      <p className="text-sm text-slate-500 mt-2">
        Checks like these are a regulatory requirement so we can give you the best treatment possible.
      </p>

      <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mt-5 mb-6">
        <ul className="space-y-1.5 text-xs text-slate-600">
          <li>✓ Face clearly visible</li>
          <li>✓ Full body visible, head to toe</li>
          <li>✓ Light-coloured, fitted clothing</li>
          <li className="text-danger-500">✕ No hoodies, coats, or baggy layers</li>
        </ul>
      </div>

      <div className="space-y-4">
        <PhotoUploadField kind="BODY_PHOTO_FRONT" label="Front-facing" hint="Photo 1 of 2" onUploaded={setFrontFileId} />
        <PhotoUploadField kind="BODY_PHOTO_SIDE" label="Side-facing" hint="Photo 2 of 2" onUploaded={setSideFileId} />
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
