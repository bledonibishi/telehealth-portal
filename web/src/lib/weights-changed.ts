'use client';

import { useEffect, useRef } from 'react';

const EVENT = 'telehealth:weights-changed';

/**
 * Said once whenever a weighing is added, changed or removed, so every part of the page that
 * shows weights (the cards, the chart, the photos) reloads, wherever the change was made.
 */
export function announceWeightsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function useOnWeightsChanged(listener: () => void) {
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => {
    const handle = () => latest.current();
    window.addEventListener(EVENT, handle);
    return () => window.removeEventListener(EVENT, handle);
  }, []);
}
