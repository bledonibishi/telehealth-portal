/**
 * The one place the loading look is decided. Every component reads these class strings, so re-theming the whole system
 * is one call, usually in an app's root layout:
 *
 *   configureLoading({ spinner: 'text-teal-600', bar: 'bg-teal-600' });
 *
 * Colours default to the app's own `brand` palette and to the surrounding text colour, so they follow light and dark mode.
 * One-off changes go through the `className` prop on the component instead.
 */
export const loadingConfig = {
  /** The spinner's colour. */
  spinner: 'text-brand-500',
  /** A skeleton block's fill: the text colour at low opacity, so it suits any background. */
  skeleton: 'bg-current opacity-[0.09]',
  /** The label beside a spinner. */
  label: 'opacity-70',
  /** The thin bar across the top of the page. */
  bar: 'bg-brand-500',
  /** How long a request must run before the top bar appears, so quick ones (and background polling) stay invisible. */
  requestDelayMs: 500,
  /** The same for moving to another page, which should feel immediate. */
  routeDelayMs: 100,
};

export type LoadingConfig = typeof loadingConfig;

export function configureLoading(overrides: Partial<LoadingConfig>) {
  Object.assign(loadingConfig, overrides);
}

/** Joins class names, skipping the empty ones. */
export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
