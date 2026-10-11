'use client';

import { LoadingState } from '@telehealth/loading';
import { useI18n } from '@/lib/i18n/I18nProvider';

// Shown while a page of the portal loads. Client component only so the label can be translated.
export default function Loading() {
  const { t } = useI18n();
  return <LoadingState variant="page" label={t('Loading…')} />;
}
