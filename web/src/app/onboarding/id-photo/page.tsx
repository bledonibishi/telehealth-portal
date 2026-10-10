'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import PhotoUploadField from '@/components/onboarding/PhotoUploadField';
import { SAVE_IDENTITY_STEP, MY_ONBOARDING, START_IDENTITY_VERIFICATION } from '@/graphql/onboarding';
import { fileIdOfUrl } from '@/components/onboarding/BodyPhotoFlow';
import { useIdentityVerification } from '@/lib/useIdentityVerification';
import { InlineError } from '@/components/common/Alert';
import { LoadingState } from '@telehealth/loading';

const CHECKLIST = ['Have a valid ID ready (e.g. passport, driving licence)', 'Find a well-lit spot for your selfie'];

/**
 * Identity check through the verification service: the patient photographs their ID and takes a
 * selfie on the service's own page, and we show where it stands. The link carries a one-time token,
 * so it is only kept in memory for this visit and never stored.
 */
function VerifiedIdentityStep({
  status,
  refetch,
}: {
  status: string | null;
  refetch: () => void;
}) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [start, { loading }] = useMutation(START_IDENTITY_VERIFICATION);

  const open = (url: string, win: Window | null) => {
    // Opened in a new tab so the patient's place here is kept; falls back to this tab if blocked.
    if (win) win.location.href = url;
    else window.location.assign(url);
  };

  const begin = async () => {
    setError(null);
    // Opened straight from the tap, before the request, so browsers don't treat it as a popup.
    const win = window.open('', '_blank');
    try {
      const res = await start();
      const url: string = res.data.startIdentityVerification.hostedUrl;
      setLink(url);
      open(url, win);
      refetch();
    } catch (err: any) {
      win?.close();
      setError(err);
    }
  };

  const finished = status === 'PROCESSING' || status === 'NEEDS_REVIEW' || status === 'APPROVED';
  const canStart = !status || status === 'PENDING' || status === 'EXPIRED' || status === 'REJECTED';

  return (
    <div>
      <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>

      <h1 className="text-xl font-bold text-slate-900 mt-4">Verify your identity</h1>
      <p className="text-sm text-slate-500 mt-2">
        This is legally required before we can prescribe and is only used for this verification.
      </p>

      {status === 'REJECTED' && (
        <div className="mt-5 bg-danger-50 border border-danger-100 text-danger-500 rounded-md px-4 py-3 text-sm">
          We couldn&rsquo;t verify your identity. Please try again with clear photos of your ID card and yourself.
        </div>
      )}
      {status === 'EXPIRED' && (
        <div className="mt-5 bg-slate-100 text-slate-600 rounded-md px-4 py-3 text-sm">
          That link has expired. Start again to get a new one.
        </div>
      )}

      {finished ? (
        <div className="bg-white rounded-lg border border-slate-100 p-5 mt-6 text-center">
          <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xl mx-auto mb-3">
            {status === 'APPROVED' ? '✓' : '⏳'}
          </div>
          <p className="text-sm font-semibold text-slate-900">
            {status === 'APPROVED' ? 'Identity verified' : 'We’re checking your ID'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {status === 'APPROVED'
              ? 'You’re all set with this step.'
              : 'This can take a little while. You can carry on with the other steps — we’ll update this automatically.'}
          </p>
          <button
            onClick={() => router.push('/onboarding')}
            className="w-full mt-5 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-md text-sm transition-colors"
          >
            Continue
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-slate-100 p-4 mt-6">
            <p className="text-sm font-semibold text-slate-900 mb-3">Before you start</p>
            <ul className="space-y-3">
              {['Have your Kosovo ID card ready', 'Find a well-lit spot for your selfie'].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full border-2 border-brand-500 text-brand-500 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">✓</span>
                  <span className="text-sm text-slate-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {status === 'PENDING' && link && (
            <p className="text-xs text-slate-500 mt-4">
              Finish the check on the verification page, then come back here. We&rsquo;ll update this page as soon as you&rsquo;re done.
            </p>
          )}
          <InlineError error={error} size="xs" className="mt-3" />

          {canStart && (
            <button
              onClick={link && status === 'PENDING' ? () => open(link, window.open('', '_blank')) : begin}
              disabled={loading}
              className="w-full mt-8 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold py-3 rounded-md text-sm transition-colors"
            >
              {loading ? 'Opening…' : link && status === 'PENDING' ? 'Open the verification page again' : status === 'REJECTED' || status === 'EXPIRED' ? 'Try again' : 'Start verification'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function IdPhotoStepPage() {
  const { data, loading, refetch } = useIdentityVerification();
  const idv = data?.myIdentityVerification;

  if (loading) return <LoadingState label="Loading…" className="!py-12" />;
  if (idv?.configured) return <VerifiedIdentityStep status={idv.status ?? null} refetch={() => void refetch()} />;
  return <UploadedIdentityStep />;
}

/** The original flow, used when the verification service isn't set up. */
function UploadedIdentityStep() {
  const router = useRouter();
  const [phase, setPhase] = useState<'intro' | 'capture'>('intro');
  const [idDocumentFileId, setIdDocumentFileId] = useState<string | null>(null);
  const [selfieFileId, setSelfieFileId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

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
    setError(null);
    try {
      await saveIdentityStep({ variables: { input: { [field]: fileId } } });
    } catch (err: any) {
      setError(err);
    }
  };

  const canContinue = !!idDocumentFileId && !!selfieFileId;

  const handleContinue = async () => {
    if (!canContinue) return;
    setError(null);
    try {
      router.push('/onboarding');
    } catch (err: any) {
      setError(err);
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

        <div className="bg-white rounded-lg border border-slate-100 p-4 mt-6">
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
          className="w-full mt-8 bg-ink-700 hover:bg-ink-800 text-white font-semibold py-3 rounded-md text-sm transition-colors"
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

      <InlineError error={error} size="xs" className="mt-3" />

      <button
        onClick={handleContinue}
        disabled={!canContinue || loading}
        className="w-full mt-6 bg-ink-700 hover:bg-ink-800 disabled:opacity-40 text-white font-semibold py-3 rounded-md text-sm transition-colors"
      >
        {loading ? 'Saving…' : 'Continue'}
      </button>
    </div>
  );
}
