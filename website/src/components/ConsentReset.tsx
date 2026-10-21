'use client';

import { setConsent } from '@/lib/consent';

/** Forgets the cookie choice and reloads, so the banner asks again. */
export default function ConsentReset({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={() => {
        setConsent(null);
        window.location.reload();
      }}
    >
      {label}
    </button>
  );
}
