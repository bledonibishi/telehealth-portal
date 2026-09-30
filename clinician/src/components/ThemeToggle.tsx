'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'clinician.theme';

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A8.5 8.5 0 1111.2 3a6.6 6.6 0 009.8 9.8z" />
    </svg>
  );
}

/** Sun / moon switch for the two portal modes. The choice is kept in this browser. */
export default function ThemeToggle() {
  const { t } = useI18n();
  // The real value is on <html> already (set before paint); read it once mounted.
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode — the switch still works for this visit */ }
  };

  const light = theme === 'light';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!light}
      aria-label={light ? t('Switch to dark mode') : t('Switch to light mode')}
      title={light ? t('Dark mode') : t('Light mode')}
      onClick={() => choose(light ? 'dark' : 'light')}
      className="relative w-[58px] h-7 shrink-0 rounded-full border border-[color:var(--border)] bg-[color:var(--bg-subtle)] flex items-center justify-between px-[7px] transition-colors"
    >
      <SunIcon className={`w-4 h-4 relative z-10 transition-colors ${light ? 'text-amber-500' : 'text-[color:var(--t-dim)]'}`} />
      <MoonIcon className={`w-4 h-4 relative z-10 transition-colors ${light ? 'text-slate-400' : 'text-sky-200'}`} />
      <span
        className={`absolute top-[2px] left-[2px] w-6 h-6 rounded-full shadow transition-transform duration-200 ${
          light ? 'translate-x-0 bg-white' : 'translate-x-[30px] bg-sky-500/70'
        }`}
        style={light ? { boxShadow: '0 1px 4px rgba(15,23,42,.25)' } : undefined}
      />
    </button>
  );
}
