'use client';

import { useGuide } from '@telehealth/guide/web';

/** Settings: the app guide on or off, for this browser. Switching it on starts the tour of the portal straight away. */
export function GuideToggle() {
  const { ready, enabled, setEnabled } = useGuide();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">Show me around</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {enabled
            ? 'Each page explains itself the first time you open it. The Guide button at the bottom right replays any tour.'
            : 'A step-by-step tour that points out each part of the portal and what it is for.'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Show me around"
        disabled={!ready}
        onClick={() => setEnabled(!enabled)}
        className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative disabled:opacity-50 ${enabled ? 'bg-ink-700' : 'bg-slate-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}
