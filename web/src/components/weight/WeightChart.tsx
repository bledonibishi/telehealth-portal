'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  clampView, decimate, nearestByTime, panBy, Point, smoothPath, timeTicks, View, visiblePoints, weightAxis, weightDomain, zoomAt,
} from '@/lib/timeseries';
import { feelingOf, kg, kgChange } from '@/lib/weight';

const M = { l: 46, r: 14, t: 14, b: 28 };
const TAP_RADIUS = 28; // px: how near a tap must be to a point to select it

export interface WeightChartProps {
  points: Point[];
  view: View;
  /** The furthest the chart may pan/zoom out to. */
  bounds: View;
  onViewChange: (view: View) => void;
  onReset?: () => void;
  target?: number | null;
  start?: { t: number; w: number } | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Where the pace so far leads: drawn dashed from the trend line's start, with the 3- and 6-month values marked. */
  forecast?: { from: { t: number; w: number }; points: Array<{ t: number; w: number; m: number }> } | null;
}

type Gesture =
  | { type: 'pan'; x0: number; view0: View; moved: boolean }
  | { type: 'pinch'; d0: number; view0: View; anchor: number };

/**
 * Weight over time on a real time axis. Hover (or tap) snaps a crosshair and tooltip to the nearest
 * measurement; drag pans, Ctrl/⌘ + scroll or pinch zooms, arrow keys step through points.
 * Plain SVG, no chart library; long histories are thinned to the pixel width before drawing.
 */
export function WeightChart({ points, view, bounds, onViewChange, onReset, target, start, selectedId, onSelect, forecast }: WeightChartProps) {
  const clipId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(640);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // The line draws itself once, when the chart first appears; after that it must follow a pan at once.
  const [intro, setIntro] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setIntro(false), 1200); return () => clearTimeout(timer); }, []);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(Math.round(e.contentRect.width), 240)));
    ro.observe(el);
    setWidth(Math.max(Math.round(el.getBoundingClientRect().width), 240));
    return () => ro.disconnect();
  }, []);

  const height = width < 480 ? 220 : 260;
  const pw = width - M.l - M.r;
  const ph = height - M.t - M.b;
  const span = view[1] - view[0];
  const x = useCallback((t: number) => M.l + ((t - view[0]) / span) * pw, [view, span, pw]);

  const near = useMemo(() => visiblePoints(points, view), [points, view]);
  const inView = useMemo(() => near.filter((p) => p.t >= view[0] && p.t <= view[1]), [near, view]);
  const startInView = start && start.t >= view[0] && start.t <= view[1] ? start : null;

  const forecastInView = useMemo(
    () => (forecast ? [forecast.from, ...forecast.points].filter((p) => p.t >= view[0] && p.t <= view[1]) : []),
    [forecast, view],
  );
  const [dLo, dHi] = useMemo(
    () => weightDomain(
      [...(inView.length ? inView : near), ...forecastInView.map((p, i) => ({ id: `f${i}`, t: p.t, w: p.w, kind: 'DAILY' as const }))],
      target,
      startInView ? startInView.w : null,
    ),
    [inView, near, target, startInView, forecastInView],
  );
  const axis = useMemo(() => weightAxis(dLo, dHi, width < 480 ? 4 : 5), [dLo, dHi, width]);
  const y = useCallback((w: number) => M.t + ((axis.hi - w) / (axis.hi - axis.lo)) * ph, [axis, ph]);

  const xTicks = useMemo(() => timeTicks(view, Math.max(Math.floor(pw / 90), 3)), [view, pw]);
  const drawn = useMemo(() => decimate(near, view, Math.max(Math.floor(pw), 50)), [near, view, pw]);
  const path = useMemo(() => smoothPath(drawn.map((p) => ({ x: x(p.t), y: y(p.w) }))), [drawn, x, y]);
  const forecastPath = useMemo(
    () => (forecast ? [forecast.from, ...forecast.points].map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.w).toFixed(1)}`).join('') : ''),
    [forecast, x, y],
  );
  // Dots only where there's room for them; in a dense stretch the line alone reads better (check-ins always show).
  const showDots = inView.length * 9 <= pw;

  const byId = useMemo(() => new Map(near.map((p) => [p.id, p])), [near]);
  const pinned = selectedId ? points.find((p) => p.id === selectedId) ?? null : null;
  const active: Point | null = (dragging ? null : hoverId ? byId.get(hoverId) ?? null : null) ?? pinned;

  const timeAt = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return view[0] + ((clientX - r.left - M.l) / pw) * span;
  };
  const pick = (clientX: number, maxPx: number): Point | null => {
    const p = nearestByTime(inView, timeAt(clientX));
    if (!p) return null;
    const r = svgRef.current!.getBoundingClientRect();
    return Math.abs(x(p.t) - (clientX - r.left)) <= maxPx ? p : null;
  };

  const set = (v: View) => onViewChange(clampView(v, bounds));
  const zoom = (factor: number, anchor = view[0] + span / 2) => set(zoomAt(view, anchor, factor, bounds));

  // Ctrl/⌘ + wheel (also a trackpad pinch in most browsers) zooms; a sideways wheel pans. Plain vertical scrolling is left to the page.
  const latest = useRef({ view, bounds, pw, span });
  latest.current = { view, bounds, pw, span };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { view: v, bounds: b, pw: w, span: s } = latest.current;
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const anchor = v[0] + ((e.clientX - r.left - M.l) / w) * s;
        onViewChange(clampView(zoomAt(v, anchor, Math.exp(e.deltaY * 0.004), b), b));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        onViewChange(panBy(v, (e.deltaX / w) * s, b));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onViewChange]);

  // ── pointer gestures ──────────────────────────────────────────────────────
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = { type: 'pan', x0: e.clientX, view0: view, moved: false };
    else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: 'pinch', d0: dist(), view0: view, anchor: timeAt((a.x + b.x) / 2) };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g?.type === 'pinch' && pointers.current.size >= 2) {
      setDragging(true);
      set(zoomAt(g.view0, g.anchor, g.d0 / dist(), bounds));
    } else if (g?.type === 'pan' && pointers.current.size === 1) {
      const dx = e.clientX - g.x0;
      if (g.moved || Math.abs(dx) > 5) {
        g.moved = true;
        setDragging(true);
        const s0 = g.view0[1] - g.view0[0];
        set(panBy(g.view0, (-dx / pw) * s0, bounds));
      }
    } else if (e.pointerType === 'mouse') {
      setHoverId(pick(e.clientX, 9999)?.id ?? null);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (g?.type === 'pan' && !g.moved) {
      // A tap or click without dragging: pin the nearest point (tap it again, or empty space, to release).
      const p = pick(e.clientX, e.pointerType === 'mouse' ? 9999 : TAP_RADIUS);
      onSelect?.(p && p.id !== selectedId ? p.id : null);
      if (e.pointerType !== 'mouse') setHoverId(null);
    }
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      gesture.current = { type: 'pan', x0: p.x, view0: latest.current.view, moved: true };
    } else if (pointers.current.size === 0) {
      gesture.current = null;
      setDragging(false);
    }
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) { gesture.current = null; setDragging(false); }
  };

  const step = (dir: 1 | -1) => {
    const from = active ?? nearestByTime(inView, view[0] + span / 2);
    if (!from) return;
    const i = points.findIndex((p) => p.id === from.id);
    const next = points[Math.min(Math.max(i + (active ? dir : 0), 0), points.length - 1)];
    if (!next) return;
    onSelect?.(next.id);
    if (next.t < view[0] || next.t > view[1]) set([next.t - span / 2, next.t + span / 2]);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(0.6); }
    else if (e.key === '-') { e.preventDefault(); zoom(1 / 0.6); }
    else if (e.key === 'Escape') onSelect?.(null);
  };

  const summary = `Weight over time chart from ${format(view[0], 'MMM d, yyyy')} to ${format(view[1], 'MMM d, yyyy')}. ${inView.length} measurement${inView.length === 1 ? '' : 's'} shown${target ? `, target ${kg(target)}` : ''}. Use the arrow keys to step through measurements; the list below has the same data.`;
  const flip = active ? x(active.t) > M.l + pw * 0.58 : false;
  const feeling = active?.feeling ? feelingOf(active.feeling) : null;
  const targetInside = typeof target === 'number' && target >= axis.lo && target <= axis.hi;
  const btn = 'w-8 h-8 rounded-lg bg-white/90 border border-slate-200 text-slate-600 hover:bg-slate-50 text-base leading-none flex items-center justify-center';

  return (
    <div ref={wrapRef} className="relative w-full select-none" onKeyDown={onKeyDown} tabIndex={0} aria-label="Weight chart, interactive" role="group">
      <div className="absolute right-1 top-0 z-10 flex gap-1">
        <button type="button" className={btn} onClick={() => zoom(0.6)} aria-label="Zoom in">+</button>
        <button type="button" className={btn} onClick={() => zoom(1 / 0.6)} aria-label="Zoom out">−</button>
        {onReset && <button type="button" className={`${btn} text-xs px-2 w-auto`} onClick={onReset} aria-label="Reset zoom">Reset</button>}
      </div>

      <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary} style={{ touchAction: 'pan-y', display: 'block' }}>
        <defs>
          <clipPath id={clipId}><rect x={M.l} y={M.t - 4} width={pw} height={ph + 8} /></clipPath>
        </defs>

        {axis.ticks.map((tv) => (
          <g key={tv}>
            <line x1={M.l} x2={M.l + pw} y1={y(tv)} y2={y(tv)} className="stroke-slate-300" strokeOpacity="0.3" />
            <text x={M.l - 8} y={y(tv) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{Number(tv.toFixed(1))}</text>
          </g>
        ))}
        {xTicks.map((tk) => (
          <g key={tk.t}>
            <line x1={x(tk.t)} x2={x(tk.t)} y1={M.t} y2={M.t + ph} className="stroke-slate-300" strokeOpacity={tk.major ? 0.45 : 0.3} />
            <text x={x(tk.t)} y={height - 8} textAnchor="middle" className="fill-slate-400 text-[11px]">{tk.label}</text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {typeof target === 'number' && targetInside && (
            <g>
              <line x1={M.l} x2={M.l + pw} y1={y(target)} y2={y(target)} strokeDasharray="6 5" strokeWidth="1.5" className="stroke-slate-400" />
              <text x={forecast ? M.l + 4 : M.l + pw - 4} y={y(target) + 14} textAnchor={forecast ? 'start' : 'end'} className="fill-slate-500 text-[11px]">Target {kg(target)}</text>
            </g>
          )}
          {forecastPath && <path d={forecastPath} fill="none" strokeWidth="2.25" strokeDasharray="7 6" strokeLinecap="round" className="stroke-brand-600" opacity="0.55" />}
          {forecast?.points.filter((p) => (p.m === 3 || p.m === 6) && p.t >= view[0] && p.t <= view[1]).map((p) => (
            <g key={p.m}>
              <circle cx={x(p.t)} cy={y(p.w)} r="4.5" className="fill-white stroke-brand-600" strokeWidth="2" />
              <text x={x(p.t) + (x(p.t) > M.l + pw - 90 ? -8 : 0)} y={y(p.w) - 10} textAnchor={x(p.t) > M.l + pw - 90 ? 'end' : 'middle'} className="fill-slate-600 text-[11px] font-medium">{p.m} mo · {Number(p.w.toFixed(1))} kg</text>
            </g>
          ))}
          {path && <path d={path} fill="none" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" pathLength={intro ? 1 : undefined} className={`stroke-brand-600 ${intro ? 'wj-draw' : ''}`} />}
          {startInView && (
            <g>
              <circle cx={x(startInView.t)} cy={y(startInView.w)} r="4.5" className="fill-white stroke-slate-400" strokeWidth="2" />
              <text
                x={x(startInView.t) + (x(startInView.t) > M.l + pw - 70 ? -8 : x(startInView.t) < M.l + 70 ? 8 : 0)}
                y={y(startInView.w) - 10}
                textAnchor={x(startInView.t) > M.l + pw - 70 ? 'end' : x(startInView.t) < M.l + 70 ? 'start' : 'middle'}
                className="fill-slate-500 text-[11px]"
              >Start {kg(startInView.w)}</text>
            </g>
          )}
          {inView.map((p) =>
            p.kind === 'CHECK_IN' ? (
              <rect key={p.id} x={x(p.t) - 5.5} y={y(p.w) - 5.5} width="11" height="11" rx="1" transform={`rotate(45 ${x(p.t)} ${y(p.w)})`} className="fill-brand-700 stroke-white" strokeWidth="2" />
            ) : showDots ? (
              <circle key={p.id} cx={x(p.t)} cy={y(p.w)} r="3" className="fill-white stroke-brand-600" strokeWidth="2" />
            ) : null,
          )}
          {active && (
            <g pointerEvents="none">
              <line x1={x(active.t)} x2={x(active.t)} y1={M.t} y2={M.t + ph} strokeDasharray="3 3" className="stroke-slate-400" />
              <line x1={M.l} x2={M.l + pw} y1={y(active.w)} y2={y(active.w)} strokeDasharray="3 3" className="stroke-slate-400" />
              <circle cx={x(active.t)} cy={y(active.w)} r="10" className="fill-brand-600/15" />
              <circle cx={x(active.t)} cy={y(active.w)} r="5.5" className="fill-brand-600 stroke-white" strokeWidth="2" />
            </g>
          )}
        </g>

        {typeof target === 'number' && !targetInside && (
          <text x={M.l + pw - 4} y={target < axis.lo ? M.t + ph - 4 : M.t + 12} textAnchor="end" className="fill-slate-500 text-[11px]">
            {target < axis.lo ? '▼' : '▲'} Target {kg(target)}
          </text>
        )}

        {active && (
          <g pointerEvents="none">
            <g transform={`translate(${M.l - 44},${y(active.w) - 9})`}>
              <rect width="42" height="18" rx="4" className="fill-slate-700" />
              <text x="21" y="12.5" textAnchor="middle" className="fill-white text-[11px] font-medium">{Number(active.w.toFixed(1))}</text>
            </g>
            <g transform={`translate(${Math.min(Math.max(x(active.t) - 56, M.l - 10), M.l + pw + M.r - 112)},${M.t + ph + 4})`}>
              <rect width="112" height="19" rx="4" className="fill-slate-700" />
              <text x="56" y="13" textAnchor="middle" className="fill-white text-[11px] font-medium">{format(active.t, 'MMM d, HH:mm')}</text>
            </g>
          </g>
        )}

        {/* Interaction layer, on top of everything. */}
        <rect
          x={M.l} y={M.t} width={pw} height={ph} fill="transparent"
          style={{ cursor: dragging ? 'grabbing' : 'crosshair' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel} onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !pointers.current.size) setHoverId(null); }}
        />
      </svg>

      {active && (
        <div
          role="status"
          className="absolute z-10 pointer-events-none bg-slate-900 text-white rounded-md shadow-lg px-3 py-2 text-xs leading-snug min-w-[9.5rem] max-w-[14rem]"
          style={{
            top: Math.max(y(active.w) - 112, 4),
            ...(flip ? { right: width - x(active.t) + 14 } : { left: x(active.t) + 14 }),
          }}
        >
          <p className="text-slate-300">{format(active.t, 'MMMM d, yyyy')}</p>
          <p className="text-slate-300">{format(active.t, 'HH:mm')}</p>
          <p className="text-base font-semibold mt-0.5">{active.w.toFixed(1)} kg</p>
          {active.changeKg !== null && active.changeKg !== undefined && <p className="text-slate-400 mt-0.5">{kgChange(active.changeKg)} since previous</p>}
          {active.kind === 'CHECK_IN' ? (
            <p className="text-brand-100 mt-1 flex items-center gap-1.5"><span className="inline-block w-2 h-2 rotate-45 bg-brand-100" />Check-in{feeling ? ` · ${feeling.emoji} ${feeling.label}` : ''}</p>
          ) : (
            <p className="text-slate-300 mt-1 flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full border-2 border-slate-300" />Weigh-in{active.hasPhoto ? ' · with photo' : ''}</p>
          )}
          {active.note && <p className="text-slate-300 italic mt-1 break-words">“{active.note}”</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1 px-1">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-brand-600" /> Your weight</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full border-2 border-brand-600" /> Weigh-in</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2 h-2 rotate-45 bg-brand-700" /> Check-in</span>
        {typeof target === 'number' && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-slate-400" /> Target</span>}
        {forecast && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-brand-600/60" /> If you keep the same pace</span>}
        {/* Hint for the input the device actually has: a mouse, or fingers. */}
        <span className="hidden [@media(pointer:fine)]:inline ml-auto">Drag to pan · Ctrl/⌘ + scroll to zoom</span>
        <span className="[@media(pointer:fine)]:hidden ml-auto">Drag to pan · pinch to zoom</span>
      </div>
    </div>
  );
}
