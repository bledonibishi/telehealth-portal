'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 space-y-3">
      <p className="text-sm text-danger-500">{error.message}</p>
      <button
        onClick={reset}
        className="text-xs text-brand-500 hover:text-brand-900 underline"
      >
        {t('Try again')}
      </button>
    </div>
  );
}
