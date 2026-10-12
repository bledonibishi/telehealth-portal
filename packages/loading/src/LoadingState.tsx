'use client';

import { useEffect, useState } from 'react';
import { Spinner } from './Spinner';
import { cx, loadingConfig } from './config';

const VARIANTS = {
  /** In the flow of a line, beside other content. */
  inline: { box: 'inline-flex items-center gap-2 text-sm', spinner: 'sm' as const },
  /** Fills a card or a section. */
  block: { box: 'flex flex-col items-center justify-center gap-2 py-12 text-sm', spinner: 'md' as const },
  /** Fills the page while a whole screen loads. */
  page: { box: 'flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm', spinner: 'lg' as const },
};
export type LoadingVariant = keyof typeof VARIANTS;

/**
 * "Loading" for a section or a page: a spinner and a label, announced to screen readers. Pass `label` already
 * translated (`t('Loading queue…')`). `delay` holds it back for that many ms, so a fast load never flashes it.
 */
export function LoadingState({ label = 'Loading…', variant = 'block', delay = 0, className }: { label?: string; variant?: LoadingVariant; delay?: number; className?: string }) {
  const [show, setShow] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return;
    const timer = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  if (!show) return null;

  const v = VARIANTS[variant];
  return (
    <div role="status" aria-live="polite" className={cx(v.box, className)}>
      <Spinner size={v.spinner} />
      <span className={loadingConfig.label}>{label}</span>
    </div>
  );
}
