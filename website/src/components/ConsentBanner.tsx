'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { initAnalytics } from '@/lib/analytics';
import { getConsent, setConsent } from '@/lib/consent';
import { DICT, LEGAL_PATHS, type Lang } from '@/lib/i18n';

/** Asks once whether analytics cookies may be used. Nothing but the necessary runs until the visitor accepts. */
export default function ConsentBanner() {
  const pathname = usePathname() ?? '/';
  const lang: Lang = pathname === '/sq' || pathname.startsWith('/sq/') ? 'sq' : 'en';
  const t = DICT[lang].consent;
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(getConsent() === null), []);
  if (!open) return null;

  const choose = (value: 'accepted' | 'declined') => {
    setConsent(value);
    if (value === 'accepted') initAnalytics();
    setOpen(false);
  };

  return (
    <div className="pv-consent" role="dialog" aria-label={t.more} aria-live="polite">
      <p>
        {t.text}{' '}
        <Link href={LEGAL_PATHS[lang].cookies}>{t.more}</Link>
      </p>
      <div className="pv-consent-actions">
        <button type="button" className="pv-consent-btn pv-consent-btn--ghost" onClick={() => choose('declined')}>{t.decline}</button>
        <button type="button" className="pv-consent-btn" onClick={() => choose('accepted')}>{t.accept}</button>
      </div>
    </div>
  );
}
