import { DoseStatus, RedFlagSeverity } from '../common/enums';

// Two weekly GLP-1 doses in a row not taken is enough for tolerance to the
// current dose to wane: restarting straight back at it risks the severe GI
// side effects titration exists to avoid, so a clinician should decide
// whether to continue or restart lower.
export const MISSED_IN_A_ROW_THRESHOLD = 2;

export type MissedStreak = { count: number; since: Date | null; lastTakenAt: Date | null };

/**
 * How many of the most recent logged doses in a row were not taken (missed,
 * or deliberately skipped — either way no drug went in), counting back from
 * the latest until one that was taken. Doses still scheduled (not yet due, or
 * inside the grace period) are ignored.
 */
export function missedStreak(events: { scheduledFor: Date; status: string; takenAt?: Date | null }[]): MissedStreak {
  const past = events
    .filter((e) => e.status !== DoseStatus.SCHEDULED)
    .sort((a, b) => b.scheduledFor.getTime() - a.scheduledFor.getTime());
  let count = 0;
  let since: Date | null = null;
  for (const e of past) {
    if (e.status === DoseStatus.TAKEN) return { count, since, lastTakenAt: e.takenAt ?? e.scheduledFor };
    count++;
    since = e.scheduledFor;
  }
  return { count, since, lastTakenAt: null };
}

/** Whether a streak on a titrated product needs a clinician's decision — the starting dose has nothing lower to restart at. */
export function needsRetitrationReview(streak: MissedStreak, titrationStep: number | null | undefined): boolean {
  return streak.count >= MISSED_IN_A_ROW_THRESHOLD && !!titrationStep && titrationStep > 1;
}

export function retitrationFlag(streak: MissedStreak, strengthLabel: string) {
  const since = streak.since ? ` since ${streak.since.toISOString().slice(0, 10)}` : '';
  return {
    severity: RedFlagSeverity.WARNING,
    description: `${streak.count} doses in a row not taken${since} while on ${strengthLabel} — consider restarting at a lower dose rather than continuing at this one`,
  };
}
