import React from 'react';
import { describeError } from '@telehealth/shared-types';
import { Button, Notice } from './ui';

/**
 * A boxed error from whatever failed (an Apollo error, an Error, a message), for a screen or card that could not load
 * or save. Red for an error, amber for a warning. Offers "Try again" when `onRetry` is given and trying again can help.
 */
export function ErrorNotice({ error, title, onRetry, action }: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  /** A next step for this particular error, e.g. a "Get a new link" button when the code says the link expired. */
  action?: React.ReactNode;
}) {
  const described = describeError(error);
  if (!described) return null;
  const retry = onRetry && described.retryable ? <Button label="Try again" variant="link" onPress={onRetry} /> : undefined;
  return (
    <Notice tone={described.severity === 'warning' ? 'warn' : 'danger'} title={title} action={action ?? retry}>
      {described.message}
    </Notice>
  );
}
