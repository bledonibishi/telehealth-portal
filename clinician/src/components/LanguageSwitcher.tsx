'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { LOCALES } from '@/lib/i18n/locales';
import Flag from './Flag';

/** Flag button in the header that opens the list of languages. */
export default function LanguageSwitcher({ onLight = false }: { onLight?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const current = LOCALES.find((l) => l.code === locale)!;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('Language')}: ${current.name}`}
        title={t('Language')}
        onClick={() => setOpen((v) => !v)}
        className={`h-7 pl-1.5 pr-2 flex items-center gap-1.5 rounded-full border text-xs font-semibold transition-colors ${
          onLight
            ? 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            : 'border-[color:var(--border)] bg-[color:var(--bg-subtle)] text-[color:var(--t-body)] hover:border-[color:var(--border-strong)]'
        }`}
      >
        <Flag code={locale} />
        {current.short}
        <svg className={`w-3 h-3 text-[color:var(--t-dim)] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('Language')}
          className={`absolute right-0 top-full mt-2 z-50 w-48 p-1.5 rounded-md border shadow-xl ${
            onLight ? 'border-gray-200 bg-white shadow-black/10' : 'border-[color:var(--border)] bg-[color:var(--bg-panel)] shadow-black/30'
          }`}
        >
          {LOCALES.map((l) => {
            const active = l.code === locale;
            return (
              <li key={l.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => { setLocale(l.code); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors ${
                    onLight
                      ? active ? 'bg-sky-50 text-gray-900 font-medium' : 'text-gray-700 hover:bg-gray-50'
                      : active ? 'bg-[color:var(--bg-hover)] text-[color:var(--t-strong)] font-medium' : 'text-[color:var(--t-body)] hover:bg-[color:var(--bg-card)]'
                  }`}
                >
                  <Flag code={l.code} className="w-7 h-5" />
                  <span className="flex-1">{l.name}</span>
                  {active && (
                    <svg className="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
