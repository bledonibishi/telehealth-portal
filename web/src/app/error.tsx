'use client';

import { useEffect } from 'react';
import { ERRORS, ErrorCode } from '@telehealth/shared-types';
import { Alert } from '@/components/common/Alert';

// A screen that crashed while rendering. Its own message is a bug's, so the patient gets the generic one and a way on.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 p-6">
      <Alert
        tone="error"
        title="This page didn’t load"
        action={<button type="button" onClick={reset} className="text-sm font-semibold underline underline-offset-2 hover:opacity-80">Try again</button>}
      >
        {ERRORS[ErrorCode.INTERNAL].message}
      </Alert>
      <a href="/" className="text-sm font-medium text-ink-600 hover:text-ink-800">Back to home</a>
    </div>
  );
}
