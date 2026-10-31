'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';
import { LOCALES } from '@/lib/i18n/locales';

/** Shqip / English, side by side. Each name is in its own language, so a patient finds theirs whichever is showing. */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t('Language')} className={`inline-flex rounded-full bg-slate-100 p-1 ${className}`}>
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={locale === l.code}
          lang={l.code}
          onClick={() => setLocale(l.code)}
          className={`flex-1 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${locale === l.code ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {l.name}
        </button>
      ))}
    </div>
  );
}
