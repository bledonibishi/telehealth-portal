'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { ACCEPT_TELEHEALTH_CONSENT, CONSENT_TEXT, MY_TELEHEALTH_CONSENT } from '@/graphql/intake';
import { InlineError } from '@/components/common/Alert';

/** For a patient an admin set up: the telehealth consent, accepted by the patient themselves. */
export default function ConsentPage() {
  const router = useRouter();
  const { data, loading } = useQuery(CONSENT_TEXT, { variables: { type: 'TELEHEALTH' } });
  const consent = data?.consentText;
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [accept, { loading: saving }] = useMutation(ACCEPT_TELEHEALTH_CONSENT, {
    refetchQueries: [{ query: MY_TELEHEALTH_CONSENT }],
    awaitRefetchQueries: true,
    onCompleted: () => router.push('/onboarding'),
    onError: (e) => setError(e),
  });

  return (
    <div>
      <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>
      <h1 className="text-xl font-bold text-slate-900 mt-4">Before we start</h1>
      <p className="text-sm text-slate-500 mt-2">Please read how your online consultation works.</p>

      {loading && <p className="text-sm text-slate-400 mt-6">Loading…</p>}
      {consent && (
        <fieldset className="mt-6 bg-white rounded-2xl border border-slate-100 p-4">
          <ul className="space-y-1.5 list-disc pl-5 text-sm text-slate-700">
            {consent.text.split('\n').map((line: string) => <li key={line}>{line}</li>)}
          </ul>
          <label className="flex items-start gap-2.5 mt-4 text-sm text-slate-800 cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-ink-700" />
            I understand and agree
          </label>
        </fieldset>
      )}

      <InlineError error={error} className="mt-4 px-3 py-2.5" />

      <button
        onClick={() => { setError(null); accept({ variables: { version: consent.version } }); }}
        disabled={!consent || !agreed || saving}
        className="w-full mt-6 bg-ink-700 hover:bg-ink-800 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
      >
        {saving ? 'Saving…' : 'Continue'}
      </button>
    </div>
  );
}
