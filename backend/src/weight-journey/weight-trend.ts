// What the patient's recent weights say, in one word: going up, losing steadily, holding, too scattered to read, or a
// last entry that looks like a typo. Built on the same trend line as the forecast (the median of the slopes between
// weigh-ins over the last 90 days), so one mistyped weight cannot raise a false alarm. Pure, so the rules are testable.
//
// It only describes; it never decides anything about treatment. A rising weight is shown to the patient and to their doctor.

import { DAY_MS, MAX_POINTS, MAX_TYPICAL_MISS_KG, MAX_WEEKLY_LOSS_SHARE, MIN_POINTS, MIN_SPAN_DAYS, WINDOW_DAYS, forecastWeight, median, type ForecastInput } from './weight-forecast';

export type WeightTrendLevel = 'GAIN' | 'CHECK_ENTRY' | 'STEADY_LOSS' | 'HOLDING' | 'UNSTABLE' | 'TOO_FEW';

/** The trend gains at least this share of body weight over 4 weeks: not water, and not usual on this treatment. */
export const GAIN_PCT_28_DAYS = 3;
/** A loss of at least this many kg a week counts as steady; anything between that and a gain is "holding". */
export const STEADY_LOSS_KG_PER_WEEK = 0.5;
/** The latest weight differs from the one before it by this share or more, within a week: far more than a body changes. */
export const JUMP_PCT = 5;
export const JUMP_WITHIN_DAYS = 7;
/** How many weights before the suspect pair are looked at to tell which of the two is the odd one out. */
export const JUMP_LOOK_BACK = 4;
/** With no weigh-in for this long there is nothing current to say: an old trend is not what is happening now. */
export const MAX_AGE_DAYS = 28;

export interface WeightTrend {
  level: WeightTrendLevel;
  /** The trend's pace, negative while losing. Null when there is not enough to draw one. */
  kgPerWeek: number | null;
  /** How much of body weight the trend moves in 4 weeks, negative while losing. */
  changePct28Days: number | null;
  basedOnPoints: number;
  /** Only with STEADY_LOSS: the loss is faster than is usual (a share of body weight a week that the forecast also will not believe). */
  unusuallyFast: boolean;
  /** GAIN: about how many kg the trend adds in 3 months if nothing changes. STEADY_LOSS: where it would be. */
  kgIn3Months: number | null;
  /** The weight the doctor should be told about. True only for GAIN. */
  notifyDoctor: boolean;
  /** CHECK_ENTRY only: the two weights that disagree. */
  latestKg: number | null;
  previousKg: number | null;
  jumpPct: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const base = (over: Partial<WeightTrend>): WeightTrend => ({
  level: 'TOO_FEW', kgPerWeek: null, changePct28Days: null, basedOnPoints: 0, unusuallyFast: false, kgIn3Months: null,
  notifyDoctor: false, latestKg: null, previousKg: null, jumpPct: null, ...over,
});

export function assessWeightTrend(measurements: ForecastInput[], opts: { targetKg?: number | null; now?: Date } = {}): WeightTrend {
  const now = (opts.now ?? new Date()).getTime();
  const recent = measurements
    .filter((m) => Number.isFinite(m.weightKg) && m.weightKg > 0 && m.measuredAt.getTime() <= now && m.measuredAt.getTime() >= now - WINDOW_DAYS * DAY_MS)
    .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime())
    .slice(-MAX_POINTS);

  // Everything below speaks in the present tense ("is going up", "please check your last weight"), so it needs a recent weigh-in.
  if (recent.length === 0 || recent[recent.length - 1].measuredAt.getTime() < now - MAX_AGE_DAYS * DAY_MS) return base({ basedOnPoints: recent.length });

  // A last entry that is wildly different from the one before it is checked first: it is far more likely a typo than a change in the body.
  if (recent.length >= 2) {
    const last = recent[recent.length - 1];
    const before = recent[recent.length - 2];
    const days = (last.measuredAt.getTime() - before.measuredAt.getTime()) / DAY_MS;
    const apart = (a: number, b: number) => (Math.abs(a - b) / b) * 100;
    const jump = apart(last.weightKg, before.weightKg);
    // When an earlier weight agrees with the latest, the one before it was the mistake (a typo, then the right weight added): the latest is fine.
    const agreesWithEarlier = recent.slice(-2 - JUMP_LOOK_BACK, -2).some((m) => apart(last.weightKg, m.weightKg) < JUMP_PCT);
    if (days <= JUMP_WITHIN_DAYS && jump >= JUMP_PCT && !agreesWithEarlier) {
      return base({ level: 'CHECK_ENTRY', basedOnPoints: recent.length, latestKg: round1(last.weightKg), previousKg: round1(before.weightKg), jumpPct: round1(jump) });
    }
  }
  if (recent.length < MIN_POINTS) return base({ basedOnPoints: recent.length });

  const t0 = recent[0].measuredAt.getTime();
  const spanDays = (recent[recent.length - 1].measuredAt.getTime() - t0) / DAY_MS;
  if (spanDays < MIN_SPAN_DAYS) return base({ basedOnPoints: recent.length });

  const xs = recent.map((m) => (m.measuredAt.getTime() - t0) / DAY_MS);
  const ys = recent.map((m) => m.weightKg);
  // Weigh-ins closer than half a day say nothing about pace, so they are left out of the pairs.
  const slopes: number[] = [];
  for (let i = 0; i < recent.length; i++) for (let j = i + 1; j < recent.length; j++) if (xs[j] - xs[i] >= 0.5) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
  if (slopes.length === 0) return base({ basedOnPoints: recent.length });

  const slope = median(slopes); // kg per day
  const intercept = median(ys.map((y, i) => y - slope * xs[i]));
  const nowKg = intercept + slope * xs[xs.length - 1];
  const miss = median(ys.map((y, i) => Math.abs(y - (intercept + slope * xs[i]))));

  const kgPerWeek = round1(slope * 7);
  const changePct28Days = round1(((slope * 28) / nowKg) * 100);
  const shared = { kgPerWeek, changePct28Days, basedOnPoints: recent.length };

  if (miss > MAX_TYPICAL_MISS_KG) return base({ level: 'UNSTABLE', ...shared });
  if (changePct28Days >= GAIN_PCT_28_DAYS) return base({ level: 'GAIN', ...shared, kgIn3Months: round1(slope * 84), notifyDoctor: true });
  if (slope * 7 <= -STEADY_LOSS_KG_PER_WEEK) {
    const unusuallyFast = -slope * 7 > MAX_WEEKLY_LOSS_SHARE * nowKg;
    // The forecast will not believe a loss this fast and projects a slower one, which would sit oddly beside the pace given: no projection then.
    const forecast = unusuallyFast ? null : forecastWeight(measurements, { targetKg: opts.targetKg, now: new Date(now) });
    const at3 = forecast?.available ? forecast.points.find((p) => p.monthsAhead === 3)?.weightKg ?? null : null;
    return base({ level: 'STEADY_LOSS', ...shared, kgIn3Months: at3, unusuallyFast });
  }
  return base({ level: 'HOLDING', ...shared });
}
