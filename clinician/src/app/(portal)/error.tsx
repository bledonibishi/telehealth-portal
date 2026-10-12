'use client';

import { useEffect } from 'react';
import { ERRORS, ErrorCode } from '@telehealth/shared-types';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { Alert } from '@/components/ui/Alert';

// A screen that crashed while rendering. Its own message is a bug's ("Cannot read properties of undefined"), so it
// goes to the console and the reader gets the generic one with a way to try again.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex h-full min-h-64 items-center justify-center p-6">
      <Alert
        tone="error"
        title={t('This page didn’t load')}
        className="max-w-md"
        action={<button type="button" onClick={reset} className="text-sm font-semibold underline underline-offset-2 hover:opacity-80">{t('Try again')}</button>}
      >
        {t(ERRORS[ErrorCode.INTERNAL].message)}
      </Alert>
    </div>
  );
}
