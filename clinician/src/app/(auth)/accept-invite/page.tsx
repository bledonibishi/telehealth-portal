'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@apollo/client';
import { ACCEPT_CLINICIAN_INVITE } from '@/graphql/auth';
import { useI18n } from '@/lib/i18n/I18nProvider';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const MIN = 10;
const MAX = 72;
const field = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

function AcceptInvite() {
  const { t } = useI18n();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState('');
  const [accept, { loading, data }] = useMutation(ACCEPT_CLINICIAN_INVITE, { onError: (e) => setProblem(e.message) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setProblem('');
    if (password.length < MIN || password.length > MAX) return setProblem(t('Choose a password of {min} to {max} characters.', { min: MIN, max: MAX }));
    if (password !== again) return setProblem(t('The two passwords are different.'));
    accept({ variables: { token, password } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative p-4">
      <div className="absolute top-4 right-4"><LanguageSwitcher onLight /></div>
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8 space-y-5">
        <h1 className="text-2xl font-semibold text-gray-900">{t('Choose your password')}</h1>

        {!token ? (
          <p className="text-sm text-red-600" role="alert">{t('This link is incomplete. Open the link from your email again, or ask an admin to send a new one.')}</p>
        ) : data?.acceptClinicianInvite ? (
          <div className="space-y-4" role="status">
            <p className="text-sm text-gray-700">{t('Your password is set. You can sign in now.')}</p>
            <Link href="/login" className="block w-full text-center bg-brand-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-brand-900">{t('Go to sign in')}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-gray-600">{t('An admin added you to the clinic portal. Choose a password to finish. The link works once.')}</p>
            {problem && <p className="text-sm text-danger-500 bg-danger-50 rounded px-3 py-2" role="alert">{problem}</p>}
            <div>
              <label htmlFor="pw" className="block text-sm font-medium text-gray-700 mb-1">{t('New password')}</label>
              <input id="pw" type="password" required autoComplete="new-password" minLength={MIN} maxLength={MAX} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
              <p className="text-xs text-gray-400 mt-1">{t('At least {min} characters.', { min: MIN })}</p>
            </div>
            <div>
              <label htmlFor="pw2" className="block text-sm font-medium text-gray-700 mb-1">{t('Type it again')}</label>
              <input id="pw2" type="password" required autoComplete="new-password" maxLength={MAX} value={again} onChange={(e) => setAgain(e.target.value)} className={field} />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-brand-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-brand-900 disabled:opacity-50">
              {loading ? t('Saving…') : t('Set password')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInvite />
    </Suspense>
  );
}
