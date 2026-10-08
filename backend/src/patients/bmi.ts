/**
 * Plausible adult height in centimetres: the one range for the whole backend, the same as the `height_cm` question in
 * the questionnaires and what the profile accepts. Outside it the figure is a mistyped value, and a BMI from it would mislead.
 */
export const MIN_HEIGHT_CM = 120;
export const MAX_HEIGHT_CM = 230;

/** The height when it is believable, otherwise null: a mistyped height is not shown as if it were a fact. */
export function plausibleHeightCm(heightCm: number | null | undefined): number | null {
  return heightCm != null && heightCm >= MIN_HEIGHT_CM && heightCm <= MAX_HEIGHT_CM ? heightCm : null;
}

/** Body mass index to one decimal, or null when the weight or height is missing or not believable. */
export function bmiOf(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (weightKg == null || heightCm == null) return null;
  if (!(weightKg > 0) || plausibleHeightCm(heightCm) === null) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}
