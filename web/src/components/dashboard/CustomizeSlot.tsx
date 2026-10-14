'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { DashboardSize, DashboardZone } from '@telehealth/shared-types';
import { Icon } from '@/components/portal/Icon';

/**
 * One card on the home screen. Normally it is just the card. While the patient is customizing, it gets a bar above it:
 * grab the bar (or anywhere on the card) to drag it, or use the buttons, which also work on a phone. A card that must
 * always stay shows a lock instead of the remove button.
 */
// How much of the row each size takes: a third, half, all of it.
const FRACTION: Record<DashboardSize, number> = { small: 1 / 3, medium: 1 / 2, large: 1 };
// Where the switch button sends a card, in words.
const MOVE_LABEL: Record<DashboardZone, string> = { top: 'above both columns, full width', main: 'to the wide column', side: 'to the narrow column' };
const SIZE_LABEL: Record<DashboardSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };

export function CustomizeSlot({
  title, editing, required, zone, otherZone, size, sizeOptions, first, last, dragging, canDropHere, onSetSize, onMove, onSwitchColumn, onRemove, onDragStart, onDragEnd, onDropOn, className = '', children,
}: {
  title: string;
  editing: boolean;
  required?: boolean;
  zone: DashboardZone;
  /** The other place this card could go to, when it can go somewhere else. */
  otherZone?: DashboardZone;
  /** For a card that can change size: where it is now and the sizes it offers, smallest first. Without them there is no handle. */
  size?: DashboardSize;
  sizeOptions?: DashboardSize[];
  first: boolean;
  last: boolean;
  dragging: boolean;
  /** Whether the card being dragged is allowed to land here. */
  canDropHere: boolean;
  onSetSize?: (size: DashboardSize) => void;
  onMove: (delta: -1 | 1) => void;
  onSwitchColumn: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  const [resizing, setResizing] = useState(false);
  // While the handle is held, the card is exactly as wide as the pointer says (in pixels), not one of the three sizes: it
  // follows the hand. On letting go it settles on the nearest size, sliding there.
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [target, setTarget] = useState<DashboardSize | null>(null);
  const [settle, setSettle] = useState(0);
  const slotRef = useRef<HTMLDivElement>(null);
  const start = useRef({ x: 0, width: 0 });
  const settleFrom = useRef<number | null>(null);
  const latest = useRef<{ width: number | null; size: DashboardSize | null }>({ width: null, size: null });

  // After letting go: the card is back at its real size, so slide it there from where the hand left it.
  useLayoutEffect(() => {
    const from = settleFrom.current;
    const el = slotRef.current;
    if (from == null || !el) return;
    settleFrom.current = null;
    const to = el.offsetWidth;
    if (Math.abs(from - to) > 1 && typeof el.animate === 'function') el.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }, [settle]);

  if (!editing) return <div className={className}>{children}</div>;

  const resizable = !!size && !!sizeOptions && sizeOptions.length > 1 && !!onSetSize;
  // Where the right edge would be if it followed the pointer, as a share of the row: the nearest size wins.
  const nearest = (fraction: number) => sizeOptions!.reduce((best, o) => (Math.abs(FRACTION[o] - fraction) < Math.abs(FRACTION[best] - fraction) ? o : best), sizeOptions![0]);
  const onHandleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const width = slotRef.current?.offsetWidth ?? 0;
    start.current = { x: e.clientX, width };
    latest.current = { width, size: size ?? null };
    setLiveWidth(width);
    setTarget(size ?? null);
    setResizing(true);
  };
  const onHandleMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizing) return;
    const row = slotRef.current?.parentElement?.clientWidth;
    if (!row) return;
    // The width the card was when the drag began, plus how far the pointer has gone: works from any place in the row, and
    // the card cannot get narrower than a quarter of it or wider than all of it.
    const width = Math.min(row, Math.max(row * 0.25, start.current.width + (e.clientX - start.current.x)));
    const next = nearest(width / row);
    latest.current = { width, size: next };
    setLiveWidth(width);
    setTarget(next);
  };
  const onHandleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizing) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const { width, size: next } = latest.current;
    settleFrom.current = width;
    setResizing(false);
    setLiveWidth(null);
    setTarget(null);
    if (next && next !== size) onSetSize!(next);
    setSettle((n) => n + 1);
  };
  const onHandleKey = (e: React.KeyboardEvent) => {
    if (!resizable) return;
    const i = sizeOptions!.indexOf(size!);
    const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? sizeOptions![i + 1] : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? sizeOptions![i - 1] : undefined;
    if (next) { e.preventDefault(); onSetSize!(next); }
  };

  const btn = 'h-7 min-w-7 px-1.5 rounded-md flex items-center justify-center text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div
      ref={slotRef}
      style={liveWidth != null ? { width: liveWidth, justifySelf: 'start', zIndex: 30 } : undefined}
      className={`${className} relative rounded-lg border-2 border-dashed p-2 ${resizing ? '' : 'transition-colors'} ${dragging ? 'opacity-40' : ''} ${resizing ? 'shadow-xl border-brand-600 bg-white' : over && canDropHere ? 'border-brand-600 bg-brand-50/60' : 'border-slate-300 bg-white/50'}`}
      draggable={!resizing}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', title); onDragStart(); }}
      onDragEnd={() => { setOver(false); onDragEnd(); }}
      onDragOver={(e) => {
        // Dropping is allowed only where the card fits; the cursor says so.
        if (canDropHere) e.preventDefault();
        e.dataTransfer.dropEffect = canDropHere ? 'move' : 'none';
        if (canDropHere) setOver(true);
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => { if (!canDropHere) return; e.preventDefault(); e.stopPropagation(); setOver(false); onDropOn(); }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-2 select-none">
        <span className="flex items-center gap-2 min-w-0 cursor-grab active:cursor-grabbing text-sm font-medium text-slate-700" title="Drag to move">
          <span aria-hidden className="text-slate-400">⠿</span>
          <span className="truncate">{title}</span>
          {required && <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-normal text-slate-500" title="This card always stays: it holds something you should always be able to see"><Icon name="lock" className="w-3.5 h-3.5" /> Always shown</span>}
        </span>
        <span className="flex items-center gap-0.5 shrink-0" role="toolbar" aria-label={`Arrange ${title}`}>
          <button type="button" className={btn} onClick={() => onMove(-1)} disabled={first} aria-label={`Move ${title} earlier`} title="Move earlier">↑</button>
          <button type="button" className={btn} onClick={() => onMove(1)} disabled={last} aria-label={`Move ${title} later`} title="Move later">↓</button>
          {otherZone && (
            <button type="button" className={btn} onClick={onSwitchColumn} aria-label={`Move ${title} ${MOVE_LABEL[otherZone]}`} title={`Move ${MOVE_LABEL[otherZone]}`}>
              {otherZone === 'side' ? '→' : otherZone === 'top' ? '⇱' : '←'}
            </button>
          )}
          {!required && (
            <button type="button" className={`${btn} hover:!text-red-600`} onClick={onRemove} aria-label={`Remove ${title}`} title="Remove this card">
              <Icon name="close" className="w-4 h-4" />
            </button>
          )}
        </span>
      </div>
      {resizable && (
        <button
          type="button"
          role="slider"
          aria-label={`Resize ${title}`}
          aria-valuemin={0}
          aria-valuemax={sizeOptions!.length - 1}
          aria-valuenow={sizeOptions!.indexOf(size!)}
          aria-valuetext={SIZE_LABEL[(target ?? size)!]}
          title="Drag to make this card smaller or bigger"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={onHandleKey}
          style={{ touchAction: 'none' }}
          className={`hidden md:flex absolute -top-3 -right-3 z-10 w-7 h-7 items-center justify-center rounded-full border bg-white shadow-sm text-slate-500 cursor-ew-resize hover:text-slate-900 hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-brand-600 ${resizing ? 'border-brand-600 text-brand-700' : 'border-slate-300'}`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 8l-4 4 4 4M17 8l4 4-4 4M3 12h18" /></svg>
          {resizing && <span className="absolute top-8 right-0 whitespace-nowrap rounded-md bg-slate-900 text-white text-[11px] font-medium px-2 py-1 shadow">{SIZE_LABEL[(target ?? size)!]}</span>}
        </button>
      )}
      {/* The card itself is not clickable while arranging: a stray tap must not leave the page. */}
      <div className="pointer-events-none select-none">{children}</div>
    </div>
  );
}
