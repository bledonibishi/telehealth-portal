'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApolloClient, useMutation } from '@apollo/client';
import { ACTIVATE_ACCOUNT } from '@/graphql/auth';
import { setToken } from '@/lib/auth';

const MIN_LENGTH = 10;

function ActivateForm() {
  const router = useRouter();
  const apollo = useApolloClient();
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const [activate, { loading }] = useMutation(ACTIVATE_ACCOUNT, {
    async onCompleted(data) {
      setToken(data.activateAccount.accessToken, data.activateAccount.refreshToken);
      await apollo.clearStore();
      router.push('/onboarding');
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError('The two passwords don’t match.');
    activate({ variables: { input: { token, password } } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-bold text-2xl text-slate-900 tracking-tight">telehealth</span>
          <p className="text-sm text-slate-500 mt-1">Patient portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          {!token ? (
            <>
              <h1 className="text-xl font-semibold text-slate-900 mb-2">Link not valid</h1>
              <p className="text-sm text-slate-500">This activation link is incomplete. Request a new one and we&rsquo;ll email it to you.</p>
              <Link href="/get-started" className="inline-block mt-4 text-sm font-medium text-brand-600 hover:text-brand-700">
                Get a new link →
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900 mb-2">Choose your password</h1>
              <p className="text-sm text-slate-500 mb-6">You&rsquo;ll use it to sign in to your patient portal.</p>

              {error && (
                <div className="mb-4 text-sm text-danger-500 bg-danger-50 border border-danger-100 rounded-lg px-3 py-2">
                  {error}{' '}
                  {error.toLowerCase().includes('link') && (
                    <Link href="/get-started" className="underline">
                      Get a new link
                    </Link>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">At least {MIN_LENGTH} characters.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  {loading ? 'Saving…' : 'Set password and continue'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense>
      <ActivateForm />
    </Suspense>
  );
}
