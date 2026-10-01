'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@apollo/client';
import { REQUEST_ACTIVATION_LINK } from '@/graphql/auth';

function GetStartedForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const [requestLink, { loading }] = useMutation(REQUEST_ACTIVATION_LINK, {
    onCompleted: () => setSent(true),
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    requestLink({ variables: { input: { email: email.trim() } } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-bold text-2xl text-slate-900 tracking-tight">telehealth</span>
          <p className="text-sm text-slate-500 mt-1">Patient portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          {sent ? (
            <>
              <h1 className="text-xl font-semibold text-slate-900 mb-2">Check your inbox</h1>
              <p className="text-sm text-slate-500">
                If <strong className="text-slate-700">{email}</strong> has an account waiting to be set up, we&rsquo;ve emailed you a link to
                choose your password. It can take a minute to arrive.
              </p>
              <p className="text-sm text-slate-500 mt-4">
                Already set your password?{' '}
                <Link href="/login" className="text-brand-600 font-medium hover:text-brand-700">
                  Sign in
                </Link>
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Use a different email
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900 mb-2">Set up your account</h1>
              <p className="text-sm text-slate-500 mb-6">
                Enter the email you paid with and we&rsquo;ll send you a link to choose your password.
              </p>

              {error && (
                <div className="mb-4 text-sm text-danger-500 bg-danger-50 border border-danger-100 rounded-lg px-3 py-2">{error}</div>
              )}

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
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  {loading ? 'Sending…' : 'Email me a link'}
                </button>
              </form>

              <p className="text-xs text-slate-400 text-center mt-6">
                Already have a password?{' '}
                <Link href="/login" className="text-brand-600 hover:text-brand-700">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GetStartedPage() {
  return (
    <Suspense>
      <GetStartedForm />
    </Suspense>
  );
}
