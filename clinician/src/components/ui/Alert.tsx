'use client';

import { describeError, type DescribedError } from '@telehealth/shared-types';
import { useI18n } from '@/lib/i18n/I18nProvider';

/**
 * Messages for the care team: a boxed Alert for anything that needs reading, and InlineError for the one line under a
 * form or button. Errors go in as they came (an Apollo error, a thrown Error, a message string): `describeError`
 * picks a safe message and whether it is an error (red) or a warning (amber), and the message is translated with
 * t(), so screens never show `error.message`. Works in both portal themes (the tones are remapped in globals.css).
 */

export type AlertTone = 'error' | 'warning' | 'info' | 'success';

const TONES: Record<AlertTone, { box: string; icon: string; inline: string }> = {
  error: { box: 'bg-danger-50 border-danger-500/25 text-danger-900', icon: 'text-danger-500', inline: 'text-danger-500' },
  warning: { box: 'bg-warn-50 border-warn-500/30 text-warn-900', icon: 'text-warn-500', inline: 'text-warn-500' },
  info: { box: 'bg-brand-50 border-brand-500/25 text-brand-900', icon: 'text-brand-500', inline: 'text-brand-500' },
  success: { box: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700', icon: 'text-emerald-500', inline: 'text-emerald-600' },
};

function ToneIcon({ tone, className }: { tone: AlertTone; className?: string }) {
  const path = {
    error: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    warning: 'M12 9v4m0 4h.01M10.3 3.9L2.2 18a2 2 0 001.7 3h16.2a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
    info: 'M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  }[tone];
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export function Alert({ tone = 'info', title, children, action, className = '' }: {
  tone?: AlertTone;
  /** Already translated. */
  title?: string;
  children?: React.ReactNode;
  /** A button or link shown under the message, e.g. "Try again". */
  action?: React.ReactNode;
  /** Spacing only (margins, width); the look comes from `tone`. */
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'} className={`flex gap-3 rounded-md border px-4 py-3 text-sm ${t.box} ${className}`}>
      <ToneIcon tone={tone} className={`mt-0.5 h-5 w-5 shrink-0 ${t.icon}`} />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'opacity-90' : ''}>{children}</div>}
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  );
}

const toneOf = (e: DescribedError): AlertTone => (e.severity === 'warning' ? 'warning' : 'error');

/** A boxed error from whatever failed. Offers "Try again" when `onRetry` is given and trying again can help. */
export function ErrorAlert({ error, title, onRetry, action, className }: {
  error: unknown;
  /** Already translated. */
  title?: string;
  onRetry?: () => void;
  /** A next step for this particular error, e.g. a "Get a new link" link when the code says the link expired. */
  action?: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const described = describeError(error);
  if (!described) return null;
  const retry = onRetry && described.retryable && (
    <button type="button" onClick={onRetry} className="text-sm font-semibold underline underline-offset-2 hover:opacity-80">
      {t('Try again')}
    </button>
  );
  return (
    <Alert tone={toneOf(described)} title={title} action={action || retry || undefined} className={className}>
      {t(described.message)}
    </Alert>
  );
}

/** One line of error or warning text, for under a form, a field or a button. Renders nothing when there is no error. */
export function InlineError({ error, size = 'sm', className = '' }: { error: unknown; size?: 'xs' | 'sm'; className?: string }) {
  const { t } = useI18n();
  const described = describeError(error);
  if (!described) return null;
  const tone = toneOf(described);
  return (
    <p role="alert" className={`flex items-start gap-1.5 ${size === 'xs' ? 'text-xs' : 'text-sm'} ${TONES[tone].inline} ${className}`}>
      <ToneIcon tone={tone} className={`shrink-0 ${size === 'xs' ? 'mt-px h-3.5 w-3.5' : 'mt-0.5 h-4 w-4'}`} />
      <span>{t(described.message)}</span>
    </p>
  );
}
