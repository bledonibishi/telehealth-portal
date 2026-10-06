'use client';

import { useEffect, useRef, useState } from 'react';

export type ChipState = 'shown' | 'flagged' | 'missing';

/**
 * A numbered chip for one detail the check reads (name, medicine, dose, date). Hovering it, tapping
 * it on a phone, or pressing Enter on it "opens" it; the parent shows the explanation (DetailInfo)
 * in a fixed spot, so the chips themselves never move.
 */
export function DetailChip({
  n, label, state, open, highlighted = false, onOpenChange,
}: {
  n: number;
  label: string;
  state: ChipState;
  open: boolean;
  /** Lit up without being opened: its outline on the photo is the one spotlit right now. */
  highlighted?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tone = {
    shown: { chip: 'bg-brand-50 text-brand-800', badge: 'bg-brand-600 text-white' },
    flagged: { chip: 'bg-amber-50 text-amber-800', badge: 'bg-amber-500 text-white' },
    missing: { chip: 'bg-slate-50 text-slate-400', badge: 'bg-slate-200 text-slate-500' },
  }[state];
  // How the last press happened: a mouse opens chips by hovering, so its click mustn't toggle them shut.
  const pointer = useRef<string>('');

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        // Mouse: hover opens it. Touch: a tap toggles it. Keyboard: Enter or Space toggles it.
        onPointerEnter={(e) => e.pointerType === 'mouse' && onOpenChange(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onOpenChange(false)}
        onPointerDown={(e) => (pointer.current = e.pointerType)}
        onBlur={() => onOpenChange(false)}
        onClick={() => {
          if (pointer.current !== 'mouse') onOpenChange(!open);
          pointer.current = '';
        }}
        className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full pl-0.5 pr-2 py-0.5 transition-shadow duration-200 ${tone.chip} ${
          open || highlighted ? 'ring-2 ring-offset-1 ring-current' : ''
        }`}
      >
        <span className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${tone.badge}`}>
          {state === 'missing' ? '✗' : n}
        </span>
        <span className={state === 'missing' ? 'line-through' : ''}>{label}</span>
      </button>
    </li>
  );
}

/**
 * A line of text that crossfades to a chip's explanation while one is open, and back to `idle`
 * when none is. Both texts share one grid cell, so the line never changes height or position.
 */
export function DetailInfo({ idle, info, open }: { idle: string; info: React.ReactNode; open: boolean }) {
  const layer =
    'col-start-1 row-start-1 self-center text-center text-xs leading-snug transition-opacity duration-300 ease-out motion-reduce:transition-none';
  return (
    <div className="grid mt-2 min-h-[2rem]" aria-live="polite">
      <p className={`${layer} text-slate-600 ${open ? 'opacity-0' : 'opacity-100'}`}>{idle}</p>
      <p className={`${layer} text-slate-800 ${open ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!open}>
        {info}
      </p>
    </div>
  );
}

// How long each detail is spotlit during the tour.
const SPOTLIGHT_MS = 1800;

/**
 * Which detail is spotlit. On each new `restartKey` (e.g. a new slide) the details are shown once,
 * in order — a short tour — and then nothing is, until the patient hovers or taps one (`open`).
 */
export function useSpotlight<K extends string>(keys: K[], open: K | null, restartKey?: unknown): K | null {
  const [spot, setSpot] = useState(0);
  useEffect(() => setSpot(0), [restartKey]);
  useEffect(() => {
    if (spot >= keys.length) return; // tour over
    const t = setTimeout(() => setSpot((s) => s + 1), SPOTLIGHT_MS);
    return () => clearTimeout(t);
  }, [spot, keys.length, restartKey]);
  return open ?? (spot < keys.length ? keys[spot] : null);
}

/** What each detail means, shown when its chip opens. */
export const DETAIL_INFO = {
  NAME: 'Your full name, as on your account',
  MEDICINE: 'The medicine, e.g. Wegovy or Mounjaro',
  DOSE: 'The strength, e.g. 2.5 mg',
  DATE: 'When it was dispensed — within the last 3 months',
} as const;

export const MISSING_INFO = 'Not on this one — the pharmacy label has it';
