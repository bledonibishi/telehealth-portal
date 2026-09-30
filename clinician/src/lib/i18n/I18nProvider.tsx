'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { format as formatDate, formatDistanceToNow } from 'date-fns';
import { DATE_LOCALES, DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale, type Locale } from './locales';
import { DICTIONARIES } from './dictionaries';

type Vars = Record<string, string | number>;

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** False until the saved language has been read — the shell stays hidden until then so it never flashes English. */
  ready: boolean;
  /**
   * Translate an English source string. The English text is the key, so a string nobody has translated yet
   * simply shows in English. `{name}` placeholders are filled from `vars`.
   */
  t: (text: string, vars?: Vars) => string;
  /** "3 days ago" in the chosen language. */
  timeAgo: (date: Date | string | number) => string;
  /** date-fns `format` in the chosen language. */
  fmt: (date: Date | string | number, pattern: string) => string;
};

const interpolate = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;

const I18nContext = createContext<I18n>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  ready: true,
  t: (text, vars) => interpolate(text, vars),
  timeAgo: (d) => formatDistanceToNow(new Date(d), { addSuffix: true, locale: DATE_LOCALES[DEFAULT_LOCALE] }),
  fmt: (d, pattern) => formatDate(new Date(d), pattern, { locale: DATE_LOCALES[DEFAULT_LOCALE] }),
});

export const useI18n = () => useContext(I18nContext);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Starts in the default language so the server and the first client render agree; the saved choice is applied on mount.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(LOCALE_STORAGE_KEY); } catch { /* private mode */ }
    if (isLocale(saved)) setLocaleState(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* the language still changes for this visit */ }
  }, []);

  const value = useMemo<I18n>(() => {
    const dict = DICTIONARIES[locale];
    const dateLocale = DATE_LOCALES[locale];
    return {
      locale,
      setLocale,
      ready,
      t: (text, vars) => interpolate(dict[text] ?? text, vars),
      timeAgo: (d) => formatDistanceToNow(new Date(d), { addSuffix: true, locale: dateLocale }),
      fmt: (d, pattern) => formatDate(new Date(d), pattern, { locale: dateLocale }),
    };
  }, [locale, ready, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
