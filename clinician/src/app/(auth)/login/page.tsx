'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@apollo/client';
import { LOGIN_CLINICIAN, VERIFY_MFA } from '@/graphql/auth';
import { setToken } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [loginClinician, { loading: loginLoading }] = useMutation(LOGIN_CLINICIAN, {
    onCompleted(data) {
      const { accessToken, mfaRequired, pendingToken: pt } = data.loginClinician;
      if (mfaRequired) {
        setPendingToken(pt);
      } else {
        setToken(accessToken);
        router.push('/queue');
      }
    },
    onError(err) {
      setError(err.message);
    },
  });

  const [verifyMfa, { loading: mfaLoading }] = useMutation(VERIFY_MFA, {
    onCompleted(data) {
      setToken(data.verifyMfa.accessToken);
      router.push('/queue');
    },
    onError(err) {
      setError(err.message);
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginClinician({ variables: { input: { email, password } } });
  };

  const handleMfa = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    verifyMfa({ variables: { pendingToken, totpCode } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900">Clinician Login</h1>

        {error && (
          <p className="text-sm text-danger-500 bg-danger-50 rounded px-3 py-2">{error}</p>
        )}

        {!pendingToken ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-brand-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-brand-900 disabled:opacity-50"
            >
              {loginLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfa} className="space-y-4">
            <p className="text-sm text-gray-600">Enter the 6-digit code from your authenticator app.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TOTP Code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 tracking-widest text-center text-lg"
              />
            </div>
            <button
              type="submit"
              disabled={mfaLoading}
              className="w-full bg-brand-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-brand-900 disabled:opacity-50"
            >
              {mfaLoading ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
