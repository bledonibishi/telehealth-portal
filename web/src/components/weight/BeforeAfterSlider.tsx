'use client';

import { useState } from 'react';
import { AuthedImage } from '@/components/common/AuthedImage';

/**
 * Two photos on top of each other with a handle to drag between them: "before" on the left,
 * "after" on the right. The range input underneath does the dragging, so touch, mouse and keyboard
 * (arrow keys) all work, and screen readers get a labelled slider.
 */
export function BeforeAfterSlider({ beforeId, afterId, beforeLabel, afterLabel }: { beforeId: string; afterId: string; beforeLabel: string; afterLabel: string }) {
  const [pos, setPos] = useState(50);

  return (
    <div className="relative w-full aspect-[3/4] max-h-[22rem] mx-auto overflow-hidden rounded-2xl bg-slate-100 select-none touch-pan-y">
      <AuthedImage fileId={afterId} alt={`After: ${afterLabel}`} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <AuthedImage fileId={beforeId} alt={`Before: ${beforeLabel}`} className="w-full h-full object-cover" />
      </div>

      <span className="absolute left-3 top-3 text-[11px] font-medium bg-slate-900/70 text-white rounded-full px-2.5 py-1">Before · {beforeLabel}</span>
      <span className="absolute right-3 top-3 text-[11px] font-medium bg-slate-900/70 text-white rounded-full px-2.5 py-1">After · {afterLabel}</span>

      <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -translate-x-1/2 w-0.5 bg-white shadow" />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-slate-500 text-xs">⇆</div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare before and after photos"
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
      />
    </div>
  );
}
