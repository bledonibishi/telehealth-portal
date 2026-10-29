'use client';

import { useEffect } from 'react';
import { initAnalytics } from '@/lib/analytics';
import { getConsent } from '@/lib/consent';

/** Starts analytics only for a visitor who has agreed to it (see ConsentBanner). */
export default function Analytics() {
  useEffect(() => {
    if (getConsent() === 'accepted') initAnalytics();
  }, []);
  return null;
}
