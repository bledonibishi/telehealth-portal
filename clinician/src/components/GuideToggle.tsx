'use client';

import { useGuide } from '@telehealth/guide/web';
import { useI18n } from '@/lib/i18n/I18nProvider';

/** Switches the app guide on and off for this browser. Switching it on starts the tour of the portal. */
export default function GuideToggle() {
  const { t } = useI18n();
  const { ready, enabled, setEnabled } = useGuide();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      data-guide="guide-switch"
      disabled={!ready}
      onClick={() => setEnabled(!enabled)}
      title={enabled ? t('Turn the guide off') : t('Turn on the guide: it shows you around the portal step by step')}
      className={`h-7 shrink-0 rounded-full border px-2.5 flex items-center gap-1.5 text-xs font-medium transition-colors ${
        enabled
          ? 'border-brand-500 bg-brand-500 text-white'
          : 'border-[color:var(--border)] bg-[color:var(--bg-subtle)] text-[color:var(--t-muted)] hover:text-[color:var(--t-strong)]'
      }`}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />
      </svg>
      <span className="hidden sm:inline">{t('Guide')}</span>
    </button>
  );
}
