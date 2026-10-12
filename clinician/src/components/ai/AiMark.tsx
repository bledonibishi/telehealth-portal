'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';

/** The small mark on anything an AI wrote, so nobody mistakes it for something a colleague wrote or the record itself. */
export function AiMark({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span title={t('Written by AI. Check it against the record.')} className={`inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zm7 11l.9 2.6L22.5 16.5l-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9L19 13z" /></svg>
      AI
    </span>
  );
}
