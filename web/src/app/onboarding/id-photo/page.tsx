'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import PhotoUploadField from '@/components/onboarding/PhotoUploadField';
import { SAVE_IDENTITY_STEP, MY_ONBOARDING } from '@/graphql/onboarding';
import { fileIdOfUrl } from '@/components/onboarding/BodyPhotoFlow';

const CHECKLIST = ['Have a valid ID ready (e.g. passport, driving licence)', 'Find a well-lit spot for your selfie'];

export default function IdPhotoStepPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'intro' | 'capture'>('intro');
  const [idDocumentFileId, setIdDocumentFileId] = useState<string | null>(null);
  const [selfieFileId, setSelfieFileId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data } = useQuery(MY_ONBOARDING, { fetchPolicy: 'network-only' });
  const [saveIdentityStep, { loading }] = useMutation(SAVE_IDENTITY_STEP, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  // Coming back: show what was already saved, and open straight at the photos if any is.
  const onboarding = data?.myOnboarding;
  useEffect(() => {
    if (!onboarding) return;
    const doc = fileIdOfUrl(onboarding.idDocumentUrl);
    const selfie = fileIdOfUrl(onboarding.selfieUrl);
    setIdDocumentFileId((x) => x ?? doc);
    setSelfieFileId((x) => x ?? selfie);
    if (doc || selfie) setPhase('capture');
  }, [onboarding]);

  // Each photo is saved the moment it is uploaded, so leaving halfway loses nothing.
  const saveOne = async (field: 'idDocumentFileId' | 'selfieFileId', fileId: string) => {
    setError('');
    try {
      await saveIdentityStep({ variables: { input: { [field]: fileId } } });
    } catch (err: any) {
      setError(err.message ?? 'We couldn’t save that photo. Please try again.');
    }
  };

  const canContinue = !!idDocumentFileId && !!selfieFileId;

  const handleContinue = async () => {
    if (!canContinue) return;
    setError('');
    try {
      router.push('/onboarding');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  if (phase === 'intro') {
    return (
      <div>
        <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>

        <h1 className="text-xl font-bold text-slate-900 mt-4">Verify your identity</h1>
        <p className="text-sm text-slate-500 mt-2">
          This is legally required before we can prescribe and is only used for this verification.
        </p>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 mt-6">
          <p className="text-sm font-semibold text-slate-900 mb-3">Before you start</p>
          <ul className="space-y-3">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full border-2 border-ink-500 text-ink-500 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">✓</span>
                <span className="text-sm text-slate-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => setPhase('capture')}
          className="w-full mt-8 bg-ink-700 hover:bg-ink-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          Start verification
        </button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setPhase('intro')} className="text-sm text-slate-400 hover:text-slate-600">← Back</button>

      <h1 className="text-xl font-bold text-slate-900 mt-4">Verify your identity</h1>
      <p className="text-sm text-slate-500 mt-2">Upload a clear photo of your ID and a selfie.</p>

      <div className="space-y-4 mt-6">
        <PhotoUploadField
          kind="ID_DOCUMENT"
          label="Government ID"
          hint="Passport or driving licence, all corners visible"
          existingFileId={fileIdOfUrl(onboarding?.idDocumentUrl)}
          onUploaded={(id) => { setIdDocumentFileId(id); saveOne('idDocumentFileId', id); }}
        />
        <PhotoUploadField
          kind="SELFIE"
          label="Selfie"
          hint="Look directly at the camera"
          existingFileId={fileIdOfUrl(onboarding?.selfieUrl)}
          onUploaded={(id) => { setSelfieFileId(id); saveOne('selfieFileId', id); }}
        />
      </div>

      {error && <p className="text-xs text-danger-500 mt-3">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={!canContinue || loading}
        className="w-full mt-6 bg-ink-700 hover:bg-ink-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
      >
        {loading ? 'Saving…' : 'Continue'}
      </button>
    </div>
  );
}
