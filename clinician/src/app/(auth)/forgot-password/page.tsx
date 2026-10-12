'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@apollo/client';
import { REQUEST_CLINICIAN_PASSWORD_RESET } from '@/graphql/auth';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<unknown>(null);
  const [request, { loading, data }] = useMutation(REQUEST_CLINICIAN_PASSWORD_RESET, { onError: (e) => setProblem(e) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    request({ variables: { input: { email } } });
  };

  return (
    <div className="space-y-5">
        <h1 className="text-2xl font-semibold text-gray-900">{t('Forgot password?')}</h1>
        {data?.requestClinicianPasswordReset ? (
          <div className="space-y-4" role="status">
            <p className="text-sm text-gray-700">{t('If an account exists for this email, a link to choose a new password is on its way. It works once and expires in 60 minutes.')}</p>
            <Link href="/login" className="block w-full text-center w-full bg-brand-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-brand-900 ">{t('Go to sign in')}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-gray-600">{t('Enter your work email and we will send you a link to choose a new password.')}</p>
            <InlineError error={problem} className="px-3 py-2" />
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">{t('Email')}</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-brand-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-brand-900 disabled:opacity-50">{loading ? t('Sending…') : t('Send reset link')}</button>
            <Link href="/login" className="block text-center text-xs text-gray-500 hover:text-gray-900">{t('Back to sign in')}</Link>
          </form>
        )}
    </div>
  );
}
