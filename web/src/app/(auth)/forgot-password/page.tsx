'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@apollo/client';
import { REQUEST_PASSWORD_RESET } from '@/graphql/auth';
import { InlineError } from '@/components/common/Alert';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [request, { loading, data }] = useMutation(REQUEST_PASSWORD_RESET, { onError: (err) => setError(err) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    request({ variables: { input: { email } } });
  };

  return (
    <>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Forgot your password?</h1>
          {data?.requestPatientPasswordReset ? (
            <div role="status" className="space-y-4">
              <p className="text-sm text-slate-600">If an account exists for <strong>{email}</strong>, we&rsquo;ve emailed a link to choose a new password. It works once and expires in 60 minutes.</p>
              <p className="text-xs text-slate-400">Nothing arrived? Check your spam folder, or try again in a few minutes.</p>
              <Link href="/login" className="inline-block text-sm font-medium text-brand-600 hover:text-brand-700">← Back to sign in</Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-6">Enter your email and we&rsquo;ll send you a link to choose a new one.</p>
              <InlineError error={error} className="mb-4 px-3 py-2" />
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="you@example.com" />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">{loading ? 'Sending…' : 'Send reset link'}</button>
              </form>
              <p className="text-xs text-slate-400 text-center mt-6"><Link href="/login" className="text-brand-600 hover:text-brand-700">Back to sign in</Link></p>
            </>
          )}
    </>
  );
}
