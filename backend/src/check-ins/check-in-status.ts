import { CheckInStatus } from '../common/enums';
import { MonthlyCheckInState } from '../weight-journey/models/weight-journey.model';

/** How long "your check-in is done" stays the headline after a patient completes one. */
export const COMPLETED_BANNER_DAYS = 14;

type Row = { status: string; token?: string | null; tokenExpiresAt?: Date | null; dueAt?: Date | null; completedAt?: Date | null };

export interface CheckInStatusSummary {
  state: MonthlyCheckInState;
  /** Opens the check-in; only while it is READY. */
  url?: string;
  /** When the open one was due (READY), or when the next one is (UPCOMING). */
  nextDueAt?: Date;
  lastCompletedAt?: Date;
  /**
   * A check-in was sent and its link ran out before it was done. Nothing re-sends it by itself, so the patient has to be told
   * to ask for a new one (the state stays UPCOMING, as the weight journey has always shown it).
   */
  linkExpired?: boolean;
}

/**
 * Where a patient is with their monthly check-in, from their check-ins: one sent and still open is READY; one just done is
 * COMPLETED for a couple of weeks; otherwise UPCOMING, with the next scheduled date when there is one.
 */
export function checkInStatusOf(checkIns: Row[], buildUrl: (token?: string | null) => string | null, now = new Date()): CheckInStatusSummary {
  const ready = checkIns.find((c) => c.status === CheckInStatus.SENT && c.tokenExpiresAt && c.tokenExpiresAt > now);
  const lastDone = checkIns
    .filter((c) => c.status === CheckInStatus.COMPLETED && c.completedAt)
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];
  const upcoming = checkIns.find((c) => c.status === CheckInStatus.SCHEDULED);
  const lastCompletedAt = lastDone?.completedAt ?? undefined;

  if (ready) return { state: MonthlyCheckInState.READY, url: buildUrl(ready.token) ?? undefined, nextDueAt: ready.dueAt ?? undefined, lastCompletedAt };
  const justDone = !!lastDone && now.getTime() - lastDone.completedAt!.getTime() < COMPLETED_BANNER_DAYS * 86_400_000;
  const expired = checkIns.some((c) => c.status === CheckInStatus.SENT && (!c.tokenExpiresAt || c.tokenExpiresAt <= now));
  return {
    state: justDone ? MonthlyCheckInState.COMPLETED : MonthlyCheckInState.UPCOMING,
    nextDueAt: upcoming?.dueAt ?? undefined,
    lastCompletedAt,
    ...(expired && !justDone ? { linkExpired: true } : {}),
  };
}
