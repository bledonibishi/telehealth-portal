export type BmiKey = 'UNDER' | 'NORMAL' | 'OVER' | 'OBESE_1' | 'OBESE_2' | 'OBESE_3';

export interface BmiBand {
  key: BmiKey;
  /** English label: shown through t(). */
  label: string;
  /** Colours for the dark surface the patient list sits on (lighter shades than the same hues on white). */
  cls: string;
}

/** The standard adult BMI bands. */
export function bmiBand(bmi: number): BmiBand {
  if (bmi < 18.5) return { key: 'UNDER', label: 'Underweight', cls: 'text-sky-400' };
  if (bmi < 25) return { key: 'NORMAL', label: 'Normal', cls: 'text-emerald-400' };
  if (bmi < 30) return { key: 'OVER', label: 'Overweight', cls: 'text-orange-400' };
  if (bmi < 35) return { key: 'OBESE_1', label: 'Obesity I', cls: 'text-red-400' };
  if (bmi < 40) return { key: 'OBESE_2', label: 'Obesity II', cls: 'text-red-300 font-semibold' };
  return { key: 'OBESE_3', label: 'Obesity III', cls: 'text-red-200 font-semibold bg-red-500/15 rounded px-1.5 -mx-1.5' };
}

export type BmiRange = 'ALL' | '25-30' | '30-35' | '35+' | 'NONE';

/** Whether a BMI falls in the chosen filter. "NONE" is the patients with no BMI to show. */
export function inBmiRange(bmi: number | null | undefined, range: BmiRange): boolean {
  if (range === 'ALL') return true;
  if (bmi == null) return range === 'NONE';
  if (range === 'NONE') return false;
  if (range === '25-30') return bmi >= 25 && bmi < 30;
  if (range === '30-35') return bmi >= 30 && bmi < 35;
  return bmi >= 35;
}

export type JoinedRange = 'ALL' | 'WEEK' | 'MONTH' | 'QUARTER';
const DAY = 86_400_000;
const JOINED_DAYS: Record<Exclude<JoinedRange, 'ALL'>, number> = { WEEK: 7, MONTH: 30, QUARTER: 90 };

/** Whether someone who joined at `createdAt` falls in the chosen window ending now. */
export function joinedWithin(createdAt: string | Date, range: JoinedRange, now: Date = new Date()): boolean {
  if (range === 'ALL') return true;
  return now.getTime() - new Date(createdAt).getTime() <= JOINED_DAYS[range] * DAY;
}
