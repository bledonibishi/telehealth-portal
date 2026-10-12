'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';

/** A record's short id (the last 8 characters), which copies the full id on click: paste it into search to find the record. */
export function CopyId({ id, className = '' }: { id: string; className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={t('Copy ID')}
      aria-label={t('Copy ID')}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 ${className}`}
    >
      #{id.slice(-8)}
      {copied ? (
        <span className="font-sans text-green-600">{t('Copied!')}</span>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3a1.5 1.5 0 01-1.5 1.5h-9a1.5 1.5 0 01-1.5-1.5v-12a1.5 1.5 0 011.5-1.5h3m3-3h6a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5h-6a1.5 1.5 0 01-1.5-1.5v-9a1.5 1.5 0 011.5-1.5z" />
        </svg>
      )}
    </button>
  );
}
