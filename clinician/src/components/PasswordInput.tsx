'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';

/** A password field with a show/hide button. Takes the same props as an <input>. */
export default function PasswordInput({ className = '', ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const label = shown ? t('Hide password') : t('Show password');
  return (
    <div className="relative">
      <input {...props} type={shown ? 'text' : 'password'} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={label}
        title={label}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:text-brand-500"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
