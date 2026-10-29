'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PORTAL_EVENT, prefersReducedMotion, type PortalRequest, type PortalTheme } from '@/lib/portal';

type Phase = 'idle' | 'cover' | 'reveal';

// The circle takes this long to fill the screen; the page loads underneath meanwhile.
const COVER_MS = 750;
// The logo stays on screen at least this long, so the moment reads as a step into another place.
const MIN_HOLD_MS = 1100;
const REVEAL_MS = 820;
// If the next page never arrives (offline, an error), the overlay still gets out of the way.
const GIVE_UP_MS = 8000;

const COPY: Record<PortalTheme, { title: string; sub: string }> = {
  shop: { title: 'Omo Shop', sub: 'Everyday health essentials · no prescription needed' },
  clinic: { title: 'Omo Pharmacy', sub: 'Doctor-led care' },
};

/**
 * Plays the transition between the clinic site and the shop (see lib/portal.ts). Mounted once in the root layout so
 * it stays on screen while the route changes underneath it.
 */
export default function PortalTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('idle');
  const [request, setRequest] = useState<PortalRequest | null>(null);
  const startedAt = useRef(0);
  const target = useRef<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const reveal = () => {
    clear();
    setPhase('reveal');
    later(() => {
      setPhase('idle');
      setRequest(null);
      target.current = null;
    }, REVEAL_MS);
  };

  useEffect(() => {
    const onPortal = (e: Event) => {
      const detail = (e as CustomEvent<PortalRequest>).detail;
      if (prefersReducedMotion()) {
        router.push(detail.href);
        return;
      }
      clear();
      router.prefetch(detail.href);
      target.current = new URL(detail.href, window.location.href).pathname;
      startedAt.current = Date.now();
      setRequest(detail);
      setPhase('cover');
      later(() => {
        router.push(detail.href);
        window.scrollTo(0, 0);
      }, COVER_MS);
      later(reveal, GIVE_UP_MS);
    };
    window.addEventListener(PORTAL_EVENT, onPortal);
    return () => {
      window.removeEventListener(PORTAL_EVENT, onPortal);
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // The new page is in: open the portal once the logo has been seen for long enough.
  useEffect(() => {
    if (phase !== 'cover' || !target.current || pathname !== target.current) return;
    const wait = Math.max(0, MIN_HOLD_MS - (Date.now() - startedAt.current));
    const t = setTimeout(reveal, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, phase]);

  useEffect(() => {
    const html = document.documentElement;
    if (phase === 'cover') html.dataset.portal = 'cover';
    else delete html.dataset.portal;
  }, [phase]);

  if (phase === 'idle' || !request) return null;
  const copy = COPY[request.theme];

  return (
    <div
      className={`omo-portal is-${phase} theme-${request.theme}`}
      style={{ '--px': `${request.x}px`, '--py': `${request.y}px` } as React.CSSProperties}
      role="status"
      aria-live="polite"
    >
      <div className="omo-portal-bg" />
      <div className="omo-portal-stage">
        <div className="omo-portal-mark" aria-hidden="true">
          <span className="omo-ring r1" />
          <span className="omo-ring r2" />
          <span className="omo-ring r3" />
          <span className="omo-portal-logo">
            <img src="/omo-logo.png?v=3" alt="" width={64} height={64} />
          </span>
        </div>
        <div className="omo-portal-title">{copy.title}</div>
        <div className="omo-portal-sub">{copy.sub}</div>
        <div className="omo-portal-bar" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}
