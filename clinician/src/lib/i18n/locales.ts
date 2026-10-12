import type { Locale as DateFnsLocale } from 'date-fns';
import { de } from 'date-fns/locale/de';
import { enGB } from 'date-fns/locale/en-GB';
import { es } from 'date-fns/locale/es';
import { sq } from 'date-fns/locale/sq';

export type Locale = 'sq' | 'en' | 'de' | 'es';

// Shown to anyone who has not chosen a language yet; a choice made with the switcher is remembered and wins.
export const DEFAULT_LOCALE: Locale = 'sq';
export const LOCALE_STORAGE_KEY = 'clinician.lang';

/** `name` is always written in the language itself, so anyone can find theirs. */
export const LOCALES: { code: Locale; name: string; short: string }[] = [
  { code: 'sq', name: 'Shqip', short: 'SQ' },
  { code: 'en', name: 'English (UK)', short: 'EN' },
  { code: 'de', name: 'Deutsch', short: 'DE' },
  { code: 'es', name: 'Español', short: 'ES' },
];

export const DATE_LOCALES: Record<Locale, DateFnsLocale> = { sq, en: enGB, de, es };

export const isLocale = (v: unknown): v is Locale => v === 'sq' || v === 'en' || v === 'de' || v === 'es';
