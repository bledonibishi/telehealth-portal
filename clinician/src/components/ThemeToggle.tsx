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
      // Two 24px slots with a 2px gap inside a 2px padding: the knob is exactly one slot and moves exactly one slot (26px),
      // so it sits centred on the sun or the moon in both modes.
      className="relative inline-flex h-[30px] w-[56px] shrink-0 items-center gap-[2px] rounded-full border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-[2px] transition-colors"
    >
      <span
        aria-hidden
        className={`absolute left-[2px] top-[2px] h-6 w-6 rounded-full transition-transform duration-200 ${light ? 'translate-x-0 bg-white' : 'translate-x-[26px] bg-sky-500/70'}`}
        style={light ? { boxShadow: '0 1px 4px rgba(15,23,42,.25)' } : undefined}
      />
      <span className="relative z-10 flex h-6 w-6 items-center justify-center">
        <SunIcon className={`h-4 w-4 transition-colors ${light ? 'text-amber-500' : 'text-[color:var(--t-dim)]'}`} />
      </span>
      <span className="relative z-10 flex h-6 w-6 items-center justify-center">
        <MoonIcon className={`h-4 w-4 transition-colors ${light ? 'text-slate-400' : 'text-sky-100'}`} />
      </span>
    </button>
  );
}
