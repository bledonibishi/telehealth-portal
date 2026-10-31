import type { Locale as DateFnsLocale } from 'date-fns';
import { enGB } from 'date-fns/locale/en-GB';
import { sq } from 'date-fns/locale/sq';

export type Locale = 'en' | 'sq';

// English until the Albanian covers every page, so nobody lands on a half-translated portal without choosing it.
// A choice made with the switcher is remembered on this browser and wins.
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'portal.lang';

/** `name` is written in the language itself, so anyone can find theirs. */
export const LOCALES: { code: Locale; name: string }[] = [
  { code: 'sq', name: 'Shqip' },
  { code: 'en', name: 'English' },
];

export const DATE_LOCALES: Record<Locale, DateFnsLocale> = { en: enGB, sq };

export const isLocale = (v: unknown): v is Locale => v === 'en' || v === 'sq';
