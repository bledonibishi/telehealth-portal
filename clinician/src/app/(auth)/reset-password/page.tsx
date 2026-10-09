'use client';

import PasswordInput from '@/components/PasswordInput';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@apollo/client';
import { RESET_PASSWORD } from '@/graphql/auth';
import { useI18n } from '@/lib/i18n/I18nProvider';

const MIN = 10;
const MAX = 72;

function ResetPassword() {
  const { t } = useI18n();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState('');
  const [reset, { loading, data }] = useMutation(RESET_PASSWORD, { onError: (e) => setProblem(e.message) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setProblem('');
    if (password.length < MIN || password.length > MAX) return setProblem(t('Choose a password of {min} to {max} characters.', { min: MIN, max: MAX }));
    if (password !== again) return setProblem(t('The two passwords are different.'));
    reset({ variables: { input: { token, newPassword: password } } });
  };

  return (
    <div className="space-y-5">
        <h1 className="text-2xl font-semibold text-gray-900">{t('Choose a new password')}</h1>
        {!token ? (
          <div className="space-y-3">
            <p className="text-sm text-red-600" role="alert">{t('This link is incomplete. Open the link from your email again, or ask an admin to send a new one.')}</p>
            <Link href="/forgot-password" className="block text-sm text-brand-500 hover:text-brand-900">{t('Get a new link')}</Link>
          </div>
        ) : data?.resetPassword ? (
          <div className="space-y-4" role="status">
            <p className="text-sm text-gray-700">{t('Your password is changed and every open session was signed out. Sign in with the new one.')}</p>
            <Link href="/login" className="block w-full text-center w-full bg-brand-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-brand-900 ">{t('Go to sign in')}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {problem && <p className="text-sm text-danger-500 bg-danger-50 rounded px-3 py-2" role="alert">{problem}</p>}
            <div>
              <label htmlFor="pw" className="block text-sm font-medium text-gray-700 mb-1">{t('New password')}</label>
              <PasswordInput id="pw"  required autoComplete="new-password" maxLength={MAX} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <p className="text-xs text-gray-400 mt-1">{t('At least {min} characters.', { min: MIN })}</p>
            </div>
            <div>
              <label htmlFor="pw2" className="block text-sm font-medium text-gray-700 mb-1">{t('Type it again')}</label>
              <PasswordInput id="pw2"  required autoComplete="new-password" maxLength={MAX} value={again} onChange={(e) => setAgain(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-brand-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-brand-900 disabled:opacity-50">{loading ? t('Saving…') : t('Set password')}</button>
          </form>
        )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}
