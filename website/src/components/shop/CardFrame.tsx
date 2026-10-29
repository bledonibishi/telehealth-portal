'use client';

import { useEffect, useState } from 'react';
import { RAIACCEPT_ORIGIN } from '@/lib/shop';

const RESULT: Record<string, string> = { success: 'success', failure: 'failed', cancel: 'cancelled', exception: 'failed' };

/**
 * The bank's card form inside our checkout. The card number, expiry, CVV and the 3-D Secure step all happen inside
 * the bank's frame, never on our page. When it finishes, RaiAccept tells us (postMessage "orderResult") and sends the
 * frame to our order page; either way the buyer lands on the order page, which checks the payment with the bank.
 */
export default function CardFrame({ reference, src }: { reference: string; src: string }) {
  const [loaded, setLoaded] = useState(false);
  const orderPage = (result: string) => `/shop/order/${encodeURIComponent(reference)}?result=${result}`;

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== RAIACCEPT_ORIGIN) return;
      const data = typeof e.data === 'string' ? safeParse(e.data) : e.data;
      if (data?.name !== 'orderResult') return;
      window.location.assign(orderPage(RESULT[data.payload?.status] ?? 'failed'));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  return (
    <div className="pm-frame-wrap">
      {!loaded && <div className="pm-frame-loading">Opening the bank’s secure card form…</div>}
      <iframe
        className={`pm-frame${loaded ? ' is-loaded' : ''}`}
        src={src}
        title="Secure card payment"
        onLoad={() => setLoaded(true)}
        allow="payment"
      />
      <p className="pm-note">
        Your card details go straight to the bank and are never seen by us.{' '}
        <a href={src.replace(/([?&])mode=frameless&?/, '$1').replace(/[?&]$/, '')}>Open the payment page in full</a> if the form doesn’t load.
      </p>
    </div>
  );
}

function safeParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
