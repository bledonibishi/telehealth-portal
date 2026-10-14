/**
 * Height and weight from the home page's BMI calculator, handed to the GLP-1 assessment so it doesn't ask again. Kept in
 * sessionStorage (this tab only) and read once: never in the URL, which analytics and browser history record.
 */
const KEY = 'th_bmi_carry';

export function saveBmiCarry(h: number, w: number): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ h, w }));
  } catch {
    /* storage blocked: the assessment simply asks */
  }
}

/** The handed-over numbers, if valid, removed as they are read. */
export function takeBmiCarry(): { h: number; w: number } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    const h = Number(v?.h);
    const w = Number(v?.w);
    return h >= 120 && h <= 230 && w >= 35 && w <= 300 ? { h, w } : null;
  } catch {
    return null;
  }
}
