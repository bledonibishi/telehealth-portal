import { cx, loadingConfig } from './config';

const SIZES = { xs: 'h-3.5 w-3.5', sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' } as const;
export type SpinnerSize = keyof typeof SIZES;

/**
 * A ring that turns. Decorative on its own (hidden from screen readers): wrap it in LoadingState, or give the busy
 * region `role="status"`, so the wait is announced once. With reduced motion it turns slowly instead of stopping.
 */
export function Spinner({ size = 'md', className }: { size?: SpinnerSize; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cx('shrink-0 animate-spin motion-reduce:[animation-duration:3s]', SIZES[size], loadingConfig.spinner, className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
