'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { Alert } from '@/components/ui/Alert';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 p-6">
      <Alert tone="info" title={t('Page not found')}>{t('We couldn’t find that page. It may have been moved or the link may be out of date.')}</Alert>
      <Link href="/" className="text-sm font-medium text-brand-500 hover:text-brand-900">{t('Back to home')}</Link>
    </div>
  );
}
