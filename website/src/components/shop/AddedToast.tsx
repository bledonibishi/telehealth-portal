'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BASKET_ADDED_EVENT } from '@/lib/shop';
import { CheckIcon } from './icons';

/** "Added to basket" with a way to the checkout, for a few seconds after something is added. */
export default function AddedToast() {
  const [added, setAdded] = useState<{ name: string; imageUrl: string | null; quantity: number; key: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onAdded = (e: Event) => {
      const detail = (e as CustomEvent<{ name: string; imageUrl: string | null; quantity: number }>).detail;
      setAdded({ ...detail, key: Date.now() });
      clearTimeout(timer);
      timer = setTimeout(() => setAdded(null), 3800);
    };
    window.addEventListener(BASKET_ADDED_EVENT, onAdded);
    return () => {
      window.removeEventListener(BASKET_ADDED_EVENT, onAdded);
      clearTimeout(timer);
    };
  }, []);

  if (!added) return null;
  return (
    <div key={added.key} className="sh-toast" role="status" aria-live="polite">
      <span className="sh-toast-img" style={added.imageUrl ? { backgroundImage: `url(${JSON.stringify(added.imageUrl)})` } : undefined}>
        <CheckIcon size={16} />
      </span>
      <span className="sh-toast-text">
        <strong>Added to basket</strong>
        <span>{added.quantity > 1 ? `${added.quantity} × ` : ''}{added.name}</span>
      </span>
      <Link href="/shop/checkout" className="sh-toast-cta">View basket</Link>
    </div>
  );
}
