export type WeightTrendLevel = 'GAIN' | 'CHECK_ENTRY' | 'STEADY_LOSS' | 'HOLDING' | 'UNSTABLE' | 'TOO_FEW';

export interface WeightTrend {
  level: WeightTrendLevel;
  kgPerWeek?: number | null;
  changePct28Days?: number | null;
  unusuallyFast: boolean;
  kgIn3Months?: number | null;
  latestKg?: number | null;
  previousKg?: number | null;
  jumpPct?: number | null;
}

export type TrendTone = 'red' | 'green' | 'orange' | 'gray';
export interface TrendMessage {
  tone: TrendTone;
  icon: string;
  title: string;
  text: string;
  /** What the notice offers to do, when there is one. */
  action?: 'MESSAGE_DOCTOR';
}

const kg = (n: number) => `${Number(n.toFixed(1))} kg`;

/**
 * What to tell the patient about their recent weights. These describe; they never tell anyone to stop or change medicine.
 * The wording is for the clinic's doctor to approve. Nothing is shown when there are too few weights to say anything.
 */
export function trendMessage(t: WeightTrend): TrendMessage | null {
  switch (t.level) {
    case 'GAIN':
      return {
        tone: 'red',
        icon: '⚠️',
        title: 'Your weight has been going up',
        text: `Over the last 4 weeks your weight has risen by about ${Math.abs(t.changePct28Days ?? 0)}%. That isn't usual on this treatment.${t.kgIn3Months ? ` If it continues you could gain about ${kg(t.kgIn3Months)} in 3 months.` : ''} Please message your doctor so they can look at your plan.`,
        action: 'MESSAGE_DOCTOR',
      };
    case 'CHECK_ENTRY':
      return {
        tone: 'orange',
        icon: '⚠️',
        title: 'Please check your last weight',
        text: `Your last weight (${kg(t.latestKg ?? 0)}) is ${Math.round(t.jumpPct ?? 0)}% different from the one before it (${kg(t.previousKg ?? 0)}), which is more than a body changes in a week. If it was a typing mistake, remove it from your weigh-ins and add the right one. If it is correct, please tell your doctor.`,
        action: 'MESSAGE_DOCTOR',
      };
    case 'STEADY_LOSS':
      return {
        tone: 'green',
        icon: '📉',
        title: `You’re losing about ${Math.abs(t.kgPerWeek ?? 0)} kg a week`,
        text:
          (t.kgIn3Months ? `At this pace you’d be around ${kg(t.kgIn3Months)} in 3 months. ` : '') +
          (t.unusuallyFast ? 'That is faster than is usual. If you aren’t eating enough or you feel unwell, tell your doctor.' : 'Keep going.'),
      };
    case 'HOLDING':
      return { tone: 'gray', icon: '➡️', title: 'Your weight is holding steady', text: 'No big change in the last few weeks. Your doctor reviews your progress at each check-in.' };
    case 'UNSTABLE':
      return {
        tone: 'orange',
        icon: '⚖️',
        title: 'Your weights vary a lot',
        text: 'Weigh yourself on the same day each week, at the same time (for example in the morning, before eating), so the trend is clear.',
      };
    default:
      return null;
  }
}
