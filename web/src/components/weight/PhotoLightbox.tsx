'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { kg, kgChange } from '@/lib/weight';
import { loadPhoto } from '@/lib/photo-cache';
import type { JourneyEntry } from '@/lib/journey-entries';
import { usePhotoUrl } from '@/components/common/AuthedImage';
import { Icon } from '@/components/portal/Icon';

const LEAVE_MS = 160;
const roundBtn = 'w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur-sm transition-colors disabled:opacity-25 disabled:hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white';
const action = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50';

export interface PhotoLightboxProps {
  photos: JourneyEntry[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onEdit: (entry: JourneyEntry) => void;
  onDelete: (entry: JourneyEntry) => void;
  onDownload: (entry: JourneyEntry) => void;
  /** The weight at the start, to say how far this photo is from it. */
  startKg?: number | null;
  /** A dialog is open on top: the keys belong to it for now. */
  suspended?: boolean;
}

/**
 * One photo, as large as the screen allows, over a blurred page. ← → (keys, buttons or a swipe)
 * move between photos; Esc, the ✕ or a click outside the photo closes it.
 */
export function PhotoLightbox({ photos, index, onIndex, onClose, onEdit, onDelete, onDownload, startKg, suspended = false }: PhotoLightboxProps) {
  const root = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const photo = photos[index];
  const { src, failed } = usePhotoUrl(photo?.fileId ?? null);

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClose, LEAVE_MS);
  };
  const go = (step: 1 | -1) => {
    const next = index + step;
    if (next >= 0 && next < photos.length) onIndex(next);
  };
  const latest = useRef({ close, go, suspended });
  latest.current = { close, go, suspended };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (latest.current.suspended) return;
      if (e.key === 'Escape') latest.current.close();
      else if (e.key === 'ArrowLeft') latest.current.go(-1);
      else if (e.key === 'ArrowRight') latest.current.go(1);
      else if (e.key === 'Tab' && root.current) {
        // Tab stays inside while the photo is open.
        const stops = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
        if (!stops.length) return;
        const first = stops[0], last = stops[stops.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  // The neighbours are fetched ahead, so the next photo is there when the arrow is pressed.
  useEffect(() => {
    for (const p of [photos[index - 1], photos[index + 1]]) if (p?.fileId) loadPhoto(p.fileId).catch(() => undefined);
  }, [photos, index]);

  if (!photo) return null;
  const date = format(new Date(photo.at), 'd MMMM yyyy');
  const sinceStart = photo.kind !== 'START' && photo.weightKg !== null && startKg != null ? Math.round((photo.weightKg - startKg) * 10) / 10 : null;

  return (
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Photo from ${date}, ${index + 1} of ${photos.length}`} className="fixed inset-0 z-50 flex flex-col focus:outline-none">
      <div className={`absolute inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-150 ${leaving ? 'opacity-0' : 'wj-fade'}`} onClick={close} aria-hidden />

      <div className="relative flex items-center justify-between px-4 py-3 pointer-events-none">
        <p className="text-sm font-medium text-white/80 tabular-nums">{index + 1} / {photos.length}</p>
        <button type="button" onClick={close} aria-label="Close" className={`${roundBtn} pointer-events-auto`}><Icon name="close" /></button>
      </div>

      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-3 sm:px-20"
        onClick={(e) => e.target === e.currentTarget && close()}
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const from = touch.current; touch.current = null;
          if (!from) return;
          const dx = e.changedTouches[0].clientX - from.x;
          const dy = e.changedTouches[0].clientY - from.y;
          if (Math.abs(dx) > 50 && Math.abs(dy) < 60) go(dx < 0 ? 1 : -1);
        }}
      >
        <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photo" className={`${roundBtn} absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 z-10`}><Icon name="left" /></button>
        <div key={photo.key} className={`max-h-full max-w-full flex ${leaving ? 'wj-leaving' : 'wj-pop'}`}>
          {src ? (
            <img src={src} alt={`Progress photo, ${date}, ${kg(photo.weightKg)}`} draggable={false} className="max-h-[calc(100dvh-15.5rem)] max-w-full object-contain rounded-xl shadow-2xl select-none" />
          ) : (
            <div className="w-56 h-72 rounded-xl bg-white/10 flex items-center justify-center text-sm text-white/70" role="status">{failed ? 'Couldn’t load this photo.' : 'Loading…'}</div>
          )}
        </div>
        <button type="button" onClick={() => go(1)} disabled={index === photos.length - 1} aria-label="Next photo" className={`${roundBtn} absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 z-10`}><Icon name="right" /></button>
      </div>

      <div className={`relative w-full sm:max-w-xl sm:mx-auto sm:mb-4 bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 ${leaving ? 'wj-leaving' : 'wj-rise'}`}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-lg font-bold text-ink-900">{kg(photo.weightKg)}</p>
          <p className="text-sm text-slate-500">{date}</p>
          <span className="text-xs font-medium text-ink-800 bg-ink-50 rounded-full px-2.5 py-0.5">{photo.label}</span>
          {sinceStart !== null && sinceStart !== 0 && <span className={`text-xs font-medium ${sinceStart < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{kgChange(sinceStart)} since you started</span>}
        </div>
        {photo.note && <p className="text-sm text-slate-600 mt-2 whitespace-pre-line break-words max-h-20 overflow-y-auto">“{photo.note}”</p>}

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button type="button" onClick={() => onDownload(photo)} className={`${action} border-slate-200 text-slate-700 hover:bg-slate-50`}><Icon name="download" className="w-4 h-4" /> Download</button>
          {photo.editable && (
            <>
              <button type="button" onClick={() => onEdit(photo)} className={`${action} border-slate-200 text-slate-700 hover:bg-slate-50`}><Icon name="pencil" className="w-4 h-4" /> Edit</button>
              <button type="button" onClick={() => onDelete(photo)} className={`${action} border-danger-100 text-danger-500 hover:bg-danger-50 sm:ml-auto`}><Icon name="trash" className="w-4 h-4" /> Delete</button>
            </>
          )}
          {!photo.editable && <p className="text-[11px] text-slate-400">{photo.kind === 'START' ? 'This is the photo from your sign-up, so it can’t be changed here.' : 'Your care team corrected this entry, so it can’t be changed here.'}</p>}
        </div>
      </div>
    </div>
  );
}
