'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The width of an element, kept up to date as it changes (a card being resized, a column appearing). A card lays itself out
 * by this, not by the width of the browser window, so it looks right at whatever width the patient gives it. `null` until
 * the first measurement.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
