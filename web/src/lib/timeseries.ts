// Pure maths for the interactive weight chart: scales, ticks, zoom/pan, decimation and
// hit-testing. No React and no DOM, so it can be tested on its own. Times are epoch ms.

export interface Point {
  id: string;
  t: number;
  w: number;
  kind: 'DAILY' | 'CHECK_IN';
  changeKg?: number | null;
  note?: string | null;
  feeling?: string | null;
}

export type View = [number, number];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Sort ascending by time and drop repeats of the same id (the same year can be fetched twice). */
export function mergePoints(chunks: Point[][]): Point[] {
  const seen = new Set<string>();
  const out: Point[] = [];
  for (const c of chunks) for (const p of c) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
  return out.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

// ── weight axis ─────────────────────────────────────────────────────────────

/** A "nice" step (1, 2, 5 × 10ⁿ) so axis labels are round numbers. */
export function niceStep(range: number, maxTicks: number): number {
  const raw = range / Math.max(maxTicks, 1);
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

export function weightAxis(lo: number, hi: number, maxTicks = 5): { lo: number; hi: number; ticks: number[] } {
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo, maxTicks);
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo: a, hi: b, ticks };
}

/** Domain for the visible points; the target is included only when it isn't so far away that it would flatten the data. */
export function weightDomain(visible: Point[], target: number | null | undefined, start: number | null | undefined): [number, number] {
  const ws = visible.map((p) => p.w);
  if (!ws.length) {
    const ref = [target, start].filter((x): x is number => typeof x === 'number');
    if (!ref.length) return [90, 130];
    return [Math.min(...ref) - 2, Math.max(...ref) + 2];
  }
  let lo = Math.min(...ws);
  let hi = Math.max(...ws);
  const span = hi - lo;
  if (typeof target === 'number') {
    const gap = target < lo ? lo - target : target > hi ? target - hi : 0;
    if (gap <= Math.max(4, span * 1.5)) { lo = Math.min(lo, target); hi = Math.max(hi, target); }
  }
  const pad = Math.max((hi - lo) * 0.12, 0.6);
  return [lo - pad, hi + pad];
}

// ── time axis ───────────────────────────────────────────────────────────────

const STEPS: Array<{ ms: number; unit: 'h' | 'd' | 'm' | 'y'; n: number }> = [
  { ms: HOUR, unit: 'h', n: 1 }, { ms: 3 * HOUR, unit: 'h', n: 3 }, { ms: 6 * HOUR, unit: 'h', n: 6 }, { ms: 12 * HOUR, unit: 'h', n: 12 },
  { ms: DAY, unit: 'd', n: 1 }, { ms: 2 * DAY, unit: 'd', n: 2 }, { ms: 7 * DAY, unit: 'd', n: 7 }, { ms: 14 * DAY, unit: 'd', n: 14 },
  { ms: 30.4 * DAY, unit: 'm', n: 1 }, { ms: 91 * DAY, unit: 'm', n: 3 }, { ms: 182 * DAY, unit: 'm', n: 6 },
  { ms: 365 * DAY, unit: 'y', n: 1 }, { ms: 730 * DAY, unit: 'y', n: 2 }, { ms: 1826 * DAY, unit: 'y', n: 5 },
];

export interface TimeTick { t: number; label: string; major: boolean }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Ticks aligned to local clock boundaries (midnight, month start, …) with short labels. */
export function timeTicks(view: View, maxTicks: number): TimeTick[] {
  const span = view[1] - view[0];
  const step = STEPS.find((s) => span / s.ms <= maxTicks) ?? STEPS[STEPS.length - 1];
  const out: TimeTick[] = [];
  const d = new Date(view[0]);

  if (step.unit === 'h' || step.unit === 'd') {
    const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    if (step.unit === 'h') c.setHours(Math.floor(d.getHours() / step.n) * step.n);
    else if (step.n > 1) c.setDate(c.getDate() - ((c.getDate() - 1) % step.n));
    for (let i = 0; i < 2000 && c.getTime() <= view[1]; i++) {
      if (c.getTime() >= view[0]) {
        const midnight = c.getHours() === 0;
        out.push({ t: c.getTime(), major: midnight, label: step.unit === 'h' && !midnight ? `${pad2(c.getHours())}:00` : `${MONTHS[c.getMonth()]} ${c.getDate()}` });
      }
      if (step.unit === 'h') c.setHours(c.getHours() + step.n); else c.setDate(c.getDate() + step.n);
    }
  } else if (step.unit === 'm') {
    const c = new Date(d.getFullYear(), d.getMonth() - (d.getMonth() % step.n), 1);
    for (let i = 0; i < 500 && c.getTime() <= view[1]; i++) {
      if (c.getTime() >= view[0]) out.push({ t: c.getTime(), major: c.getMonth() === 0, label: c.getMonth() === 0 ? String(c.getFullYear()) : MONTHS[c.getMonth()] });
      c.setMonth(c.getMonth() + step.n);
    }
  } else {
    const c = new Date(Math.floor(d.getFullYear() / step.n) * step.n, 0, 1);
    for (let i = 0; i < 500 && c.getTime() <= view[1]; i++) {
      if (c.getTime() >= view[0]) out.push({ t: c.getTime(), major: true, label: String(c.getFullYear()) });
      c.setFullYear(c.getFullYear() + step.n);
    }
  }
  return out;
}

// ── viewport ────────────────────────────────────────────────────────────────

export const MIN_SPAN = 3 * HOUR;

/** Keep a viewport inside [min, max] and between the minimum span and the whole range. */
export function clampView(view: View, bounds: View, minSpan = MIN_SPAN): View {
  const total = bounds[1] - bounds[0];
  let span = Math.min(Math.max(view[1] - view[0], Math.min(minSpan, total)), total);
  let a = view[0];
  if (a < bounds[0]) a = bounds[0];
  if (a + span > bounds[1]) a = bounds[1] - span;
  return [a, a + span];
}

/** Zoom by `factor` (<1 in, >1 out) keeping the time under the cursor where it is. */
export function zoomAt(view: View, anchor: number, factor: number, bounds: View): View {
  const ratio = (anchor - view[0]) / (view[1] - view[0]);
  const span = (view[1] - view[0]) * factor;
  const a = anchor - ratio * span;
  return clampView([a, a + span], bounds);
}

export function panBy(view: View, dt: number, bounds: View): View {
  return clampView([view[0] + dt, view[1] + dt], bounds);
}

// ── rendering + hit-testing ─────────────────────────────────────────────────

export function lowerBound(points: Point[], t: number): number {
  let lo = 0, hi = points.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (points[mid].t < t) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Points inside the view plus the one on either side, so the line runs off the edge instead of stopping short. */
export function visiblePoints(points: Point[], view: View): Point[] {
  if (!points.length) return [];
  const a = Math.max(lowerBound(points, view[0]) - 1, 0);
  const b = Math.min(lowerBound(points, view[1] + 1) + 1, points.length);
  return points.slice(a, b);
}

/**
 * Thin a dense series to roughly `columns` pixel columns while keeping its shape: per column we
 * keep the first, lowest, highest and last point. Fewer points than 2×columns pass through untouched.
 */
export function decimate(points: Point[], view: View, columns: number): Point[] {
  if (points.length <= columns * 2) return points;
  const span = view[1] - view[0];
  const buckets = new Map<number, Point[]>();
  for (const p of points) {
    const c = Math.min(Math.max(Math.floor(((p.t - view[0]) / span) * columns), -1), columns);
    const b = buckets.get(c);
    if (b) b.push(p); else buckets.set(c, [p]);
  }
  const keep = new Set<Point>();
  for (const b of buckets.values()) {
    let lo = b[0], hi = b[0];
    for (const p of b) { if (p.w < lo.w) lo = p; if (p.w > hi.w) hi = p; }
    keep.add(b[0]); keep.add(lo); keep.add(hi); keep.add(b[b.length - 1]);
  }
  return points.filter((p) => keep.has(p));
}

/** The point closest to time `t` in horizontal (time) distance — what the crosshair snaps to. */
export function nearestByTime(points: Point[], t: number): Point | null {
  if (!points.length) return null;
  const i = lowerBound(points, t);
  const a = points[Math.max(i - 1, 0)];
  const b = points[Math.min(i, points.length - 1)];
  return Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b;
}

// ── months ──────────────────────────────────────────────────────────────────

export const monthStart = (year: number, month: number) => new Date(year, month, 1).getTime();
export const monthEnd = (year: number, month: number) => new Date(year, month + 1, 1).getTime() - 1;
export const monthKey = (t: number) => { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth(); };
export const fromMonthKey = (k: number) => ({ year: Math.floor(k / 12), month: k % 12 });
export const yearStart = (y: number) => new Date(y, 0, 1).getTime();
export const yearEnd = (y: number) => new Date(y + 1, 0, 1).getTime() - 1;
