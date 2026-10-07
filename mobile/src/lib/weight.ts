// The same arithmetic the web portal uses (web/src/lib/weight.ts), so both say the same thing.
import { calendarDaysBetween } from './format';

export const FEELINGS = [
  { value: 'GREAT', emoji: '😊', label: 'Feeling great' },
  { value: 'GOOD', emoji: '🙂', label: 'Feeling good' },
  { value: 'OKAY', emoji: '😐', label: 'Feeling okay' },
  { value: 'DIFFICULTIES', emoji: '😕', label: 'Having some difficulties' },
  { value: 'NOT_WELL', emoji: '😟', label: 'Not feeling well' },
] as const;
export const feelingOf = (value?: string | null) => FEELINGS.find((f) => f.value === value);

/** A general guide for steady loss, not a promise: about half a kilo to a kilo a week. */
export const STEADY_LOSS_KG_PER_WEEK = { slow: 0.5, fast: 1 } as const;

export type TargetPlan =
  | { kind: 'LOSE'; toLoseKg: number; fastestAt: Date; slowestAt: Date; /** 0–100 of the way from the start to the target. */ percent: number | null }
  | { kind: 'AT_OR_ABOVE' };

/** What a target weight means from where the patient is now: how much to lose and when a steady pace would get them there. */
export function targetPlan(currentKg: number, targetKg: number, startKg: number | null | undefined, now: Date): TargetPlan {
  const toLose = currentKg - targetKg;
  if (!(toLose > 0)) return { kind: 'AT_OR_ABOVE' };
  const at = (kgPerWeek: number) => new Date(now.getTime() + Math.ceil(toLose / kgPerWeek) * 7 * 86_400_000);
  const span = startKg != null ? startKg - targetKg : 0;
  const percent = span > 0 ? Math.min(100, Math.max(0, ((startKg! - currentKg) / span) * 100)) : null;
  return { kind: 'LOSE', toLoseKg: Number(toLose.toFixed(1)), fastestAt: at(STEADY_LOSS_KG_PER_WEEK.fast), slowestAt: at(STEADY_LOSS_KG_PER_WEEK.slow), percent };
}

/** Check-ins are 4 weeks apart, so the one after n completed ones is the week-4(n+1) review. */
export const checkInWeek = (completed: number) => 4 * (completed + 1);

/** The line about the next check-in: ready, or the week and date it is due. Null when there is nothing to say. */
export function checkInLine(journey: { checkInState: string; nextCheckInDueAt?: string | null; entries?: unknown[] }): { ready: boolean; text: string } | null {
  if (journey.checkInState === 'READY') return { ready: true, text: 'Your check-in is ready' };
  if (!journey.nextCheckInDueAt) return null;
  const days = calendarDaysBetween(journey.nextCheckInDueAt);
  if (days < 0) return null;
  const when = days > 1 ? `in ${days} days` : days === 1 ? 'tomorrow' : 'today';
  const date = new Date(journey.nextCheckInDueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const week = checkInWeek(journey.entries?.length ?? 0);
  return { ready: false, text: `${journey.checkInState === 'COMPLETED' ? '✓ Check-in done · next: ' : 'Next check-in: '}week ${week} · ${date} (${when})` };
}
