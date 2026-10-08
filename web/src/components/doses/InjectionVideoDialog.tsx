'use client';

import { Dialog } from '@/components/common/Dialog';
import { INJECTION_VIDEO_EMBED } from '@/lib/video';

/** A short general video on using the pen. Until one is set for this deployment, it says so and points to the steps. */
export function InjectionVideoDialog({ onClose, onShowSteps }: { onClose: () => void; onShowSteps: () => void }) {
  return (
    <Dialog title="How to inject: video" onClose={onClose}>
      {INJECTION_VIDEO_EMBED ? (
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-100">
          <iframe
            src={INJECTION_VIDEO_EMBED}
            title="How to inject your pen"
            className="w-full h-full"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <div className="rounded-xl bg-slate-50 p-6 text-center">
          <p className="text-sm font-semibold text-slate-900">Our video is coming soon</p>
          <p className="text-sm text-slate-500 mt-1">Until then, the step-by-step guide covers the same ground.</p>
        </div>
      )}
      <p className="text-xs text-slate-500 mt-3">This is a general video. Your pen’s leaflet is the guide for your exact device.</p>
      <button type="button" onClick={onShowSteps} className="mt-3 text-sm font-semibold text-brand-600 hover:text-brand-700">Read the steps instead →</button>
    </Dialog>
  );
}
