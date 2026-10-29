'use client';

import { setConsent } from '@/lib/consent';
import { forgetAnalytics } from '@/lib/analytics';

/** Forgets the cookie choice and the analytics identifier, then reloads so the banner asks again. */
export default function ConsentReset({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={() => {
        setConsent(null);
        forgetAnalytics();
        window.location.reload();
      }}
    >
      {label}
    </button>
  );
}
