// Where the patient's weight is heading if they carry on at the pace they have been going.
// Plain arithmetic on their own measurements — a straight-line trend, not a medical prediction —
// and pure, so the rules live here and the apps only draw what the API returns.

export interface ForecastInput {
  measuredAt: Date;
  weightKg: number;
}

export interface ForecastPoint {
  at: Date;
  monthsAhead: number;
  weightKg: number;
}

export type ForecastUnavailableReason = 'NOT_ENOUGH_DATA' | 'NOT_LOSING' | 'TOO_VARIABLE';
export type ForecastConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type Forecast =
  | { available: false; reason: ForecastUnavailableReason }
  | {
      available: true;
      basedOnPoints: number;
      basedOnDays: number;
      /** Negative while losing. */
      kgPerWeek: number;
      confidence: ForecastConfidence;
      from: { at: Date; weightKg: number };
      /** One point a month for the next 6 months, the first at 1 month. */
      points: ForecastPoint[];
      /** When the trend would reach the target weight, if it does within the 6 months. */
      reachesTargetAt: Date | null;
    };

const DAY_MS = 86_400_000;
const MONTH_DAYS = 30.4375;
export const HORIZON_MONTHS = 6;
/** Only the recent pace counts: weight loss slows over time, so old measurements would flatter the trend. */
export const WINDOW_DAYS = 90;
export const MIN_POINTS = 3;
export const MIN_SPAN_DAYS = 14;

const round1 = (n: number) => Math.round(n * 10) / 10;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Beyond this share of body weight a week, a loss is not believable (a typo or a bad scale), so the pace is held there. */
export const MAX_WEEKLY_LOSS_SHARE = 0.015;
/** How far a typical weigh-in may sit from the trend line before the trend is not worth showing. */
const MAX_TYPICAL_MISS_KG = 2.5;
/** Only the newest weigh-ins are used, which also bounds the work. */
const MAX_POINTS = 150;

/**
 * A straight-line trend through the last 90 days of measurements, carried forward 6 months. The line is
 * the Theil–Sen kind (the median of the slopes between pairs of weigh-ins), so one mistyped weight or a
 * scale glitch cannot drag it. It never goes below the target weight, nor below 70% of today's weight
 * when there is no target, and its pace is held to a believable share of body weight per week. Needs at
 * least 3 measurements spread over 2 weeks and a downward trend; weigh-ins that jump about too much are
 * not projected either, because the line would say little.
 */
export function forecastWeight(measurements: ForecastInput[], opts: { targetKg?: number | null; now?: Date } = {}): Forecast {
  const now = (opts.now ?? new Date()).getTime();
  const recent = measurements
    .filter((m) => Number.isFinite(m.weightKg) && m.measuredAt.getTime() <= now && m.measuredAt.getTime() >= now - WINDOW_DAYS * DAY_MS)
    .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime())
    .slice(-MAX_POINTS);
  if (recent.length < MIN_POINTS) return { available: false, reason: 'NOT_ENOUGH_DATA' };

  const t0 = recent[0].measuredAt.getTime();
  const spanDays = (recent[recent.length - 1].measuredAt.getTime() - t0) / DAY_MS;
  if (spanDays < MIN_SPAN_DAYS) return { available: false, reason: 'NOT_ENOUGH_DATA' };

  const xs = recent.map((m) => (m.measuredAt.getTime() - t0) / DAY_MS);
  const ys = recent.map((m) => m.weightKg);
  const n = recent.length;

  // Weigh-ins closer than half a day say nothing about pace, so they are left out of the pairs.
  const slopes: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (xs[j] - xs[i] >= 0.5) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
  if (slopes.length === 0) return { available: false, reason: 'NOT_ENOUGH_DATA' };
  let slope = median(slopes); // kg per day
  if (!(slope < 0)) return { available: false, reason: 'NOT_LOSING' };

  const intercept = median(ys.map((y, i) => y - slope * xs[i]));
  const lastX = xs[n - 1];
  // Start from where the trend line says they are now, not from one noisy weigh-in.
  const startKg = intercept + slope * lastX;
  slope = Math.max(slope, (-MAX_WEEKLY_LOSS_SHARE * startKg) / 7);

  // How far a typical weigh-in is from the line says how much to trust it.
  const miss = median(ys.map((y, i) => Math.abs(y - (intercept + slope * xs[i]))));
  if (miss > MAX_TYPICAL_MISS_KG) return { available: false, reason: 'TOO_VARIABLE' };
  const confidence: ForecastConfidence = miss <= 0.5 && n >= 6 ? 'HIGH' : miss <= 1.2 && n >= 4 ? 'MEDIUM' : 'LOW';

  const lastAt = recent[n - 1].measuredAt.getTime();
  const floor = opts.targetKg != null ? opts.targetKg : startKg * 0.7;

  let reachesTargetAt: Date | null = null;
  const points: ForecastPoint[] = [];
  for (let m = 1; m <= HORIZON_MONTHS; m++) {
    const days = m * MONTH_DAYS;
    points.push({ at: new Date(lastAt + days * DAY_MS), monthsAhead: m, weightKg: round1(Math.max(startKg + slope * days, floor)) });
  }
  if (opts.targetKg != null && startKg > opts.targetKg) {
    const daysToTarget = (startKg - opts.targetKg) / -slope;
    if (daysToTarget <= HORIZON_MONTHS * MONTH_DAYS) reachesTargetAt = new Date(lastAt + daysToTarget * DAY_MS);
  }

  return {
    available: true,
    basedOnPoints: n,
    basedOnDays: Math.round(spanDays),
    kgPerWeek: round1(slope * 7),
    confidence,
    from: { at: new Date(lastAt), weightKg: round1(startKg) },
    points,
    reachesTargetAt,
  };
}
