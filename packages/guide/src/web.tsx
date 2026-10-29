'use client';

// The app guide in the browser (patient portal and clinician portal): the switch, the floating "Guide" button, and the
// overlay that dims the page, lights up one thing at a time and explains it. See README.md.

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  EMPTY_GUIDE_STATE, GUIDE_STORAGE_KEY, findShowableStep, markSeen, parseGuideState, serializeGuideState, stepPosition,
  type GuideState, type GuideTour,
} from './index';

export type GuideTheme = {
  card: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  /** The dim over everything that is not lit up. */
  overlay: string;
};

const DEFAULT_THEME: GuideTheme = {
  card: '#ffffff', text: '#0f172a', muted: '#64748b', border: '#e2e8f0', accent: '#0c6f6a', accentText: '#ffffff', overlay: 'rgba(15, 23, 42, 0.55)',
};

type Translate = (text: string, vars?: Record<string, string | number>) => string;
const plain: Translate = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);

type GuideContextValue = {
  /** False until the saved choice has been read, so a switch never flashes the wrong way. */
  ready: boolean;
  enabled: boolean;
  /** Turning it on starts the tour of the app straight away. */
  setEnabled: (on: boolean) => void;
  startTour: (tour: GuideTour) => void;
  startWelcome: () => void;
  /** Starts this page's tour; false when the page has none. */
  startPageTour: () => boolean;
  hasPageTour: boolean;
  running: boolean;
};

const GuideContext = createContext<GuideContextValue>({
  ready: false, enabled: false, setEnabled: () => {}, startTour: () => {}, startWelcome: () => {}, startPageTour: () => false, hasPageTour: false, running: false,
});

export const useGuide = () => useContext(GuideContext);

/** The first copy of `[data-guide=target]` that is on screen: the sidebar and the phone menu can both carry one. */
function findTarget(target: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-guide="${CSS.escape(target)}"]`);
  for (const el of Array.from(all)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

const isOnScreen = (target: string) => !!findTarget(target);

function readState(): GuideState {
  try { return parseGuideState(window.localStorage.getItem(GUIDE_STORAGE_KEY)); } catch { return EMPTY_GUIDE_STATE; }
}

function writeState(state: GuideState) {
  try { window.localStorage.setItem(GUIDE_STORAGE_KEY, serializeGuideState(state)); } catch { /* private mode: it still works for this visit */ }
}

export function GuideProvider({
  welcome, pageTour, pageKey, t = plain, theme, launcherBottom = 20, children,
}: {
  /** The tour of the whole app: the menu, and what each part is for. Starts when the guide is switched on. */
  welcome: GuideTour;
  /** The tour for the page that is open, if it has one. Starts the first time the page is opened with the guide on. */
  pageTour: GuideTour | null;
  /** Changes when the page changes (the path); a page's tour stops when you leave the page. */
  pageKey: string;
  t?: Translate;
  theme?: Partial<GuideTheme>;
  /** Room under the floating button, for apps with a bottom menu on phones. */
  launcherBottom?: number;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<GuideState>(EMPTY_GUIDE_STATE);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<{ tour: GuideTour; index: number; pageKey: string } | null>(null);
  const colors = useMemo(() => ({ ...DEFAULT_THEME, ...theme }), [theme]);

  useEffect(() => { setState(readState()); setReady(true); }, []);

  const update = useCallback((fn: (s: GuideState) => GuideState) => {
    setState((s) => { const next = fn(s); writeState(next); return next; });
  }, []);

  const startTour = useCallback((tour: GuideTour) => {
    const first = findShowableStep(tour.steps, 0, 1, isOnScreen);
    if (first >= 0) setActive({ tour, index: first, pageKey });
  }, [pageKey]);

  // Finished or skipped, a tour counts as seen: it does not start by itself again (the Guide button replays it).
  const finish = useCallback(() => {
    if (active) update((s) => markSeen(s, active.tour.id));
    setActive(null);
  }, [active, update]);

  const setEnabled = useCallback((on: boolean) => {
    update((s) => ({ ...s, enabled: on }));
    if (on) startTour(welcome); else setActive(null);
  }, [update, startTour, welcome]);

  // A page's tour belongs to that page: leaving it stops the tour (it shows again next time, as it was not finished).
  useEffect(() => {
    setActive((a) => (a && a.tour.id !== welcome.id && a.pageKey !== pageKey ? null : a));
  }, [pageKey, welcome.id]);

  // With the guide on, a page's tour starts the first time the page is opened. The wait lets the page draw what it explains.
  useEffect(() => {
    if (!ready || !state.enabled || active || !pageTour || state.seen.includes(pageTour.id)) return;
    const timer = window.setTimeout(() => startTour(pageTour), 900);
    return () => window.clearTimeout(timer);
  }, [ready, state.enabled, state.seen, active, pageTour, startTour]);

  const value = useMemo<GuideContextValue>(() => ({
    ready,
    enabled: state.enabled,
    setEnabled,
    startTour,
    startWelcome: () => startTour(welcome),
    startPageTour: () => { if (!pageTour) return false; startTour(pageTour); return true; },
    hasPageTour: !!pageTour,
    running: !!active,
  }), [ready, state.enabled, setEnabled, startTour, welcome, pageTour, active]);

  const go = (direction: 1 | -1) => {
    if (!active) return;
    const next = findShowableStep(active.tour.steps, active.index + direction, direction, isOnScreen);
    if (next >= 0) setActive({ ...active, index: next });
    else if (direction === 1) finish();
  };

  return (
    <GuideContext.Provider value={value}>
      {children}
      {ready && state.enabled && !active && (
        <GuideLauncher t={t} colors={colors} bottom={launcherBottom} hasPageTour={!!pageTour} onPage={() => pageTour && startTour(pageTour)} onWelcome={() => startTour(welcome)} onOff={() => setEnabled(false)} />
      )}
      {active && <GuideOverlay key={`${active.tour.id}:${active.index}`} tour={active.tour} index={active.index} t={t} colors={colors} onBack={() => go(-1)} onNext={() => go(1)} onClose={finish} />}
    </GuideContext.Provider>
  );
}

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;
const GAP = 12;
const EDGE = 16;
const RADIUS = 10;

/** An SVG path for a rectangle with rounded corners, drawn the other way round so it cuts a hole in the dim. */
function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  return `M${x + k} ${y}A${k} ${k} 0 0 0 ${x} ${y + k}V${y + h - k}A${k} ${k} 0 0 0 ${x + k} ${y + h}H${x + w - k}A${k} ${k} 0 0 0 ${x + w} ${y + h - k}V${y + k}A${k} ${k} 0 0 0 ${x + w - k} ${y}Z`;
}

function GuideOverlay({ tour, index, t, colors, onBack, onNext, onClose }: {
  tour: GuideTour; index: number; t: Translate; colors: GuideTheme; onBack: () => void; onNext: () => void; onClose: () => void;
}) {
  const step = tour.steps[index];
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const { n, total } = stepPosition(tour.steps, index, isOnScreen);
  const first = findShowableStep(tour.steps, index - 1, -1, isOnScreen) < 0;
  const last = findShowableStep(tour.steps, index + 1, 1, isOnScreen) < 0;

  // Follow the target while it scrolls into view or the page moves under it.
  useEffect(() => {
    if (!step.target) { setRect(null); return; }
    const el = findTarget(step.target);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    let frame = 0;
    let previous = '';
    const measure = () => {
      const target = findTarget(step.target!) ?? el;
      const b = target.getBoundingClientRect();
      const key = `${b.top}|${b.left}|${b.width}|${b.height}|${window.innerWidth}|${window.innerHeight}`;
      if (key !== previous) {
        previous = key;
        setRect({ top: b.top, left: b.left, width: b.width, height: b.height });
        setViewport({ width: window.innerWidth, height: window.innerHeight });
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [step.target]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCardSize({ width: el.offsetWidth, height: el.offsetHeight });
  }, [rect, index]);

  useEffect(() => { nextRef.current?.focus({ preventScroll: true }); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft' && !first) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, onNext, onClose, first]);

  const cardWidth = Math.min(360, viewport.width - EDGE * 2);
  const position = placeCard(rect, step.placement ?? 'auto', { width: cardWidth, height: cardSize.height }, viewport);

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      {/* Clicks on the page are held while the guide talks, so a tap meant for "Next" can't open something underneath. */}
      <div style={{ position: 'absolute', inset: 0, background: rect ? 'transparent' : colors.overlay }} onClick={(e) => e.stopPropagation()} />
      {rect && (
        <>
          {/* The dim, with a hole where the lit-up part is. */}
          <svg aria-hidden width={viewport.width} height={viewport.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <path fillRule="evenodd" fill={colors.overlay} d={`M0 0H${viewport.width}V${viewport.height}H0Z ${roundedRect(rect.left - PAD, rect.top - PAD, rect.width + PAD * 2, rect.height + PAD * 2, RADIUS)}`} />
          </svg>
          <div
            aria-hidden
            style={{
              position: 'absolute', top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
              borderRadius: RADIUS, boxShadow: `0 0 0 2px ${colors.accent}`, pointerEvents: 'none',
            }}
          />
        </>
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        aria-describedby="guide-body"
        style={{
          position: 'absolute', top: position.top, left: position.left, width: cardWidth, boxSizing: 'border-box',
          background: colors.card, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 16,
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)', fontSize: 14, lineHeight: 1.5,
          visibility: cardSize.height ? 'visible' : 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.accent }}>
            {t(tour.title)} · {t('{n} of {total}', { n, total })}
          </span>
          <button type="button" onClick={onClose} aria-label={t('Close the guide')} style={{ ...plainButton, color: colors.muted, fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
        </div>
        <p id="guide-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t(step.title)}</p>
        <p id="guide-body" style={{ margin: '4px 0 0', color: colors.muted }}>{t(step.body)}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          {!last && <button type="button" onClick={onClose} style={{ ...plainButton, color: colors.muted, fontSize: 13 }}>{t('Skip')}</button>}
          <span style={{ flex: 1 }} />
          {!first && (
            <button type="button" onClick={onBack} style={{ ...pillButton, background: 'transparent', color: colors.text, border: `1px solid ${colors.border}` }}>{t('Back')}</button>
          )}
          <button ref={nextRef} type="button" onClick={onNext} style={{ ...pillButton, background: colors.accent, color: colors.accentText, border: `1px solid ${colors.accent}` }}>
            {last ? t('Done') : t('Next')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const plainButton: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' };
const pillButton: React.CSSProperties = { ...plainButton, borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600 };

/** Where the card goes: beside a menu item, else under or over what is lit up, always fully on screen. */
function placeCard(rect: Rect | null, placement: string, card: { width: number; height: number }, viewport: { width: number; height: number }) {
  const clampTop = (top: number) => Math.max(EDGE, Math.min(top, viewport.height - card.height - EDGE));
  const clampLeft = (left: number) => Math.max(EDGE, Math.min(left, viewport.width - card.width - EDGE));
  if (!rect) return { top: clampTop((viewport.height - card.height) / 2), left: clampLeft((viewport.width - card.width) / 2) };

  const roomRight = viewport.width - (rect.left + rect.width + PAD + GAP);
  const wantsRight = placement === 'right' || (placement === 'auto' && rect.width < viewport.width / 3 && rect.left < viewport.width / 3);
  if (wantsRight && roomRight >= card.width + EDGE) {
    return { top: clampTop(rect.top + rect.height / 2 - card.height / 2), left: rect.left + rect.width + PAD + GAP };
  }

  const below = rect.top + rect.height + PAD + GAP;
  const above = rect.top - PAD - GAP - card.height;
  const fitsBelow = below + card.height <= viewport.height - EDGE;
  const fitsAbove = above >= EDGE;
  const left = clampLeft(rect.left + rect.width / 2 - card.width / 2);
  if (placement === 'top' && fitsAbove) return { top: above, left };
  if (fitsBelow && placement !== 'top') return { top: below, left };
  if (fitsAbove) return { top: above, left };
  // Something taller than the screen: the card sits at the bottom, over it.
  return { top: viewport.height - card.height - EDGE, left };
}

function GuideLauncher({ t, colors, bottom, hasPageTour, onPage, onWelcome, onOff }: {
  t: Translate; colors: GuideTheme; bottom: number; hasPageTour: boolean; onPage: () => void; onWelcome: () => void; onOff: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const item = (label: string, onClick: () => void) => (
    <button type="button" role="menuitem" onClick={() => { setOpen(false); onClick(); }} style={{ ...plainButton, display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: colors.text }}>
      {label}
    </button>
  );

  return createPortal(
    <div ref={ref} style={{ position: 'fixed', right: 20, bottom, zIndex: 990 }}>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, bottom: 52, width: 240, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.2)' }}>
          {hasPageTour && item(t('Guide me through this page'), onPage)}
          {item(t('Tour of the whole app'), onWelcome)}
          <div style={{ height: 1, background: colors.border, margin: '4px 6px' }} />
          {item(t('Turn the guide off'), onOff)}
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ ...pillButton, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: colors.accent, color: colors.accentText, boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />
        </svg>
        {t('Guide')}
      </button>
    </div>,
    document.body,
  );
}
