'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cx, loadingConfig } from './config';
import { progress, useBusy } from './progress';

// One shared animation, so the bar needs no Tailwind config: a short bar sweeps across the track.
const CSS = `
@keyframes tl-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
.tl-bar{width:30%;animation:tl-sweep 1.1s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.tl-bar{width:100%;animation:none;opacity:.7}}`;

const ROUTE_TIMEOUT_MS = 15_000;

/** A link that stays on this site and goes to a different page. */
function isPageChange(a: HTMLAnchorElement) {
  if (a.target === '_blank' || a.hasAttribute('download')) return false;
  const url = new URL(a.href, window.location.href);
  return url.origin === window.location.origin && url.pathname !== window.location.pathname;
}

/**
 * The thin bar across the top of the page. It appears when moving to another page, or when a request has been running
 * for a while (see loadingConfig), and goes away when that is done. Mount it once, in the root layout.
 */
export function GlobalProgress({ className }: { className?: string }) {
  const busy = useBusy();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const routeTimer = useRef<ReturnType<typeof setTimeout>>();

  // A click on an internal link starts the route; arriving at the new path ends it. (The App Router has no events.)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || !isPageChange(a)) return;
      progress.beginRoute();
      clearTimeout(routeTimer.current);
      routeTimer.current = setTimeout(progress.endRoute, ROUTE_TIMEOUT_MS); // never leave the bar stuck
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  useEffect(() => {
    clearTimeout(routeTimer.current);
    progress.endRoute();
  }, [pathname]);

  // Only show after the delay, so a quick load never flashes the bar.
  useEffect(() => {
    if (busy === 0) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), busy === 2 ? loadingConfig.routeDelayMs : loadingConfig.requestDelayMs);
    return () => clearTimeout(timer);
  }, [busy]);

  return (
    <>
      <style>{CSS}</style>
      <div
        role="progressbar"
        aria-label="Loading"
        aria-hidden={!visible}
        className={cx('pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden transition-opacity duration-200', visible ? 'opacity-100' : 'opacity-0', className)}
      >
        {visible && <div className={cx('tl-bar h-full rounded-full', loadingConfig.bar)} />}
      </div>
    </>
  );
}
