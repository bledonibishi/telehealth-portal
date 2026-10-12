'use client';

import { PasswordInput } from '@/components/common/PasswordInput';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@apollo/client';
import { RESET_PASSWORD } from '@/graphql/auth';
import { ErrorAlert } from '@/components/common/Alert';
import { ErrorCode, describeError } from '@telehealth/shared-types';

const MIN_LENGTH = 10;
const MAX_LENGTH = 72;

function ResetForm() {
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [reset, { loading, data }] = useMutation(RESET_PASSWORD, { onError: (err) => setError(err) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) return setError(`Use ${MIN_LENGTH} to ${MAX_LENGTH} characters.`);
    if (password !== confirm) return setError('The two passwords don’t match.');
    reset({ variables: { input: { token, newPassword: password } } });
  };

  return (
    <>
          {!token ? (
            <>
              <h1 className="text-xl font-semibold text-slate-900 mb-2">Link not valid</h1>
              <p className="text-sm text-slate-500">This link is incomplete. Request a new one and we&rsquo;ll email it to you.</p>
              <Link href="/forgot-password" className="inline-block mt-4 text-sm font-medium text-brand-600 hover:text-brand-700">Get a new link →</Link>
            </>
          ) : data?.resetPassword ? (
            <div role="status" className="space-y-4">
              <h1 className="text-xl font-semibold text-slate-900">Password updated</h1>
              <p className="text-sm text-slate-500">You&rsquo;ve been signed out everywhere. Sign in with your new password.</p>
              <Link href="/login" className="block text-center bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors w-full">Go to sign in</Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900 mb-2">Choose a new password</h1>
              <p className="text-sm text-slate-500 mb-6">At least {MIN_LENGTH} characters. The link works once.</p>
              <ErrorAlert
                error={error}
                className="mb-4"
                action={describeError(error)?.code === ErrorCode.LINK_INVALID_OR_EXPIRED && <Link href="/forgot-password" className="underline">Get a new link</Link>}
              />
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label htmlFor="pw" className="block text-sm font-medium text-slate-700 mb-1">New password</label>
                  <PasswordInput id="pw"  required autoComplete="new-password" maxLength={MAX_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label htmlFor="pw2" className="block text-sm font-medium text-slate-700 mb-1">Type it again</label>
                  <PasswordInput id="pw2"  required autoComplete="new-password" maxLength={MAX_LENGTH} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">{loading ? 'Saving…' : 'Set new password'}</button>
              </form>
            </>
          )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
