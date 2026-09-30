// The Weight Journey's numbers. Pure, so the rules live in one place and the
// clients only ever display what the API returns.

export interface Progress {
  weightLostKg: number;
  remainingKg: number;
  progressPercentage: number;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * progress = (start − current) / (start − target), clamped to 0–100. At or below
 * the target it is 100. Returns null when the goal itself is unusable
 * (target not below the starting weight).
 */
export function computeProgress(startingKg: number, targetKg: number, currentKg: number): Progress | null {
  const totalToLose = startingKg - targetKg;
  if (!(totalToLose > 0)) return null;

  const weightLost = startingKg - currentKg;
  const remaining = Math.max(currentKg - targetKg, 0);
  const progress = currentKg <= targetKg ? 100 : Math.min(Math.max((weightLost / totalToLose) * 100, 0), 100);

  return {
    weightLostKg: round1(weightLost),
    remainingKg: round1(remaining),
    progressPercentage: round2(progress),
  };
}

/** Calm, non-promissory copy for where the patient is on their journey. */
export function motivationMessage(progress: Progress | null): string {
  const pct = progress?.progressPercentage ?? 0;
  if (pct >= 100) return 'Congratulations! You’ve reached your target weight.';
  if (pct >= 75) return 'You’re getting closer to your goal.';
  if (pct >= 50) return 'Halfway there! Look how far you’ve come.';
  if (pct >= 25) return 'You’ve already completed 25% of your journey.';
  if (progress && progress.weightLostKg > 0) return 'You’re making progress. Keep going!';
  return 'Your journey starts today. Every step counts.';
}
