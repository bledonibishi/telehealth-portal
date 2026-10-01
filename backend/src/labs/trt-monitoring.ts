import { LabResultKind } from '../common/enums';

// Safety monitoring on testosterone replacement (Endocrine Society / BSSM):
// testosterone, haematocrit and PSA at baseline, then at 3, 6 and 12 months,
// then yearly. The medical lead should confirm these before go-live.

export const MONITORED_KINDS = [LabResultKind.TESTOSTERONE, LabResultKind.HEMATOCRIT, LabResultKind.PSA] as const;
export type MonitoredKind = (typeof MONITORED_KINDS)[number];

const DAY = 86_400_000;
// Repeats aren't blocked the moment a test falls due — only once it's this late.
export const OVERDUE_GRACE_DAYS = 30;
// Above this, stop or reduce treatment until it comes down (polycythaemia risk).
export const HEMATOCRIT_HOLD_PERCENT = 54;
// A rise of more than this within 12 months, or any level above the absolute
// threshold, warrants urological assessment.
export const PSA_RISE_NG_ML = 1.4;
export const PSA_ABSOLUTE_NG_ML = 4;

export type LabPoint = { kind: string; value: number; unit: string; collectedAt: Date };

/**
 * When the next result of a kind is due: at the start of treatment if there's
 * none yet, otherwise one interval after the latest, the interval widening as
 * treatment settles — 3 months early on, 6 around the half-year, then yearly.
 */
export function nextDueAt(startedAt: Date, lastCollectedAt: Date | null): Date {
  if (!lastCollectedAt) return startedAt;
  const daysOn = (lastCollectedAt.getTime() - startedAt.getTime()) / DAY;
  const interval = daysOn < 150 ? 91 : daysOn < 330 ? 182 : 365;
  return new Date(lastCollectedAt.getTime() + interval * DAY);
}

/** Haematocrit is reported either as a percentage (45) or a fraction (0.45 L/L). */
export function hematocritPercent(value: number): number {
  return value <= 1 ? value * 100 : value;
}

export type KindStatus = { kind: MonitoredKind; last: LabPoint | null; dueAt: Date; overdue: boolean };
export type MonitoringStatus = { kinds: KindStatus[]; holdReasons: string[]; warnings: string[] };

export function monitoringStatus(startedAt: Date, results: LabPoint[], now = new Date()): MonitoringStatus {
  const newestFirst = [...results].sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime());
  const holdReasons: string[] = [];
  const warnings: string[] = [];

  const kinds = MONITORED_KINDS.map((kind) => {
    const last = newestFirst.find((r) => r.kind === kind) ?? null;
    const dueAt = nextDueAt(startedAt, last?.collectedAt ?? null);
    const overdue = now.getTime() > dueAt.getTime() + OVERDUE_GRACE_DAYS * DAY;
    if (overdue) holdReasons.push(`${label(kind)} test overdue since ${dueAt.toISOString().slice(0, 10)}`);
    return { kind, last, dueAt, overdue };
  });

  const hct = kinds.find((k) => k.kind === LabResultKind.HEMATOCRIT)?.last;
  if (hct && hematocritPercent(hct.value) > HEMATOCRIT_HOLD_PERCENT) {
    holdReasons.push(`Haematocrit ${round1(hematocritPercent(hct.value))}% is above ${HEMATOCRIT_HOLD_PERCENT}% — reduce or pause treatment and recheck`);
  }

  const psas = newestFirst.filter((r) => r.kind === LabResultKind.PSA);
  const latestPsa = psas[0];
  if (latestPsa) {
    if (latestPsa.value > PSA_ABSOLUTE_NG_ML) warnings.push(`PSA ${latestPsa.value} ng/mL is above ${PSA_ABSOLUTE_NG_ML} — consider urology referral`);
    const yearBefore = latestPsa.collectedAt.getTime() - 365 * DAY;
    const lowestInYear = Math.min(...psas.filter((p) => p.collectedAt.getTime() >= yearBefore).map((p) => p.value));
    const rise = round1(latestPsa.value - lowestInYear);
    if (rise > PSA_RISE_NG_ML) warnings.push(`PSA rose ${rise} ng/mL within 12 months — consider urology referral`);
  }

  return { kinds, holdReasons, warnings };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
function label(kind: MonitoredKind) {
  return kind === LabResultKind.HEMATOCRIT ? 'Haematocrit' : kind === LabResultKind.PSA ? 'PSA' : 'Testosterone';
}
