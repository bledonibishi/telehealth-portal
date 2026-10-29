'use client';

import { useEffect } from 'react';

/** Sets the page's language on <html>: the shared root layout cannot know it, so a page in another language says so here. */
export default function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    const prev = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = prev;
    };
  }, [lang]);
  return null;
}
