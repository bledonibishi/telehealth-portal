/** Plausible adult height in centimetres. Outside it the figure is a mistyped value, and a BMI from it would mislead. */
export const MIN_HEIGHT_CM = 100;
export const MAX_HEIGHT_CM = 250;

/** Body mass index to one decimal, or null when the weight or height is missing or not believable. */
export function bmiOf(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (weightKg == null || heightCm == null) return null;
  if (!(weightKg > 0) || !(heightCm >= MIN_HEIGHT_CM && heightCm <= MAX_HEIGHT_CM)) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}
