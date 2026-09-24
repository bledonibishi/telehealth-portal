'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 space-y-3">
      <p className="text-sm text-danger-500">{error.message}</p>
      <button
        onClick={reset}
        className="text-xs text-brand-500 hover:text-brand-900 underline"
      >
        Try again
      </button>
    </div>
  );
}
