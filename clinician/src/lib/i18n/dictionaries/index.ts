import type { Locale } from '../locales';
import { de } from './de';
import { es } from './es';
import { sq } from './sq';

// English is the source language: the English text itself is the key, so it needs no dictionary.
export const DICTIONARIES: Record<Locale, Record<string, string>> = { en: {}, sq, de, es };
