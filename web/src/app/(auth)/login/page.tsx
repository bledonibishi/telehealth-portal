'use client';

import { PasswordInput } from '@/components/common/PasswordInput';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApolloClient, useMutation } from '@apollo/client';
import { LOGIN_PATIENT } from '@/graphql/auth';
import { setToken } from '@/lib/auth';
import { ErrorAlert } from '@/components/common/Alert';
import { ErrorCode, describeError } from '@telehealth/shared-types';
import { BusyLabel } from '@telehealth/loading';

export default function LoginPage() {
  const router = useRouter();
  const apollo = useApolloClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);

  const [loginPatient, { loading }] = useMutation(LOGIN_PATIENT, {
    async onCompleted(data) {
      setToken(data.loginPatient.accessToken, data.loginPatient.refreshToken);
      // Nothing cached for a previous session may render under this identity.
      await apollo.clearStore();
      router.push('/dashboard');
    },
    onError(err) {
      setError(err);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginPatient({ variables: { input: { email, password } } });
  };

  return (
    <>
          <h1 className="text-xl font-semibold text-slate-900 mb-6">Sign in to your account</h1>

          <ErrorAlert
            error={error}
            className="mb-4"
            action={describeError(error)?.code === ErrorCode.ACCOUNT_NOT_ACTIVATED && <Link href="/get-started" className="underline">Send me a new activation link</Link>}
          />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <Link href="/forgot-password" className="text-xs text-brand-600 hover:text-brand-700">Forgot password?</Link>
              </div>
              <PasswordInput
                
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              <BusyLabel busy={loading} busyText="Signing in…">Sign in</BusyLabel>
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-6">
            Just paid and haven&rsquo;t set a password yet?{' '}
            <Link href="/get-started" className="text-brand-600 hover:text-brand-700">
              Set up your account
            </Link>
          </p>
    </>
  );
}
