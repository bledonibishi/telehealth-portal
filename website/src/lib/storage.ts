const STORE = 'th_assessment';

export interface Assessment {
  product?: string;
  passed?: boolean;
  leadId?: string | null;
  email?: string;
  firstName?: string;
  lastName?: string;
  at?: number;
  plan?: string | null;
  method?: string | null;
  payseraMethod?: string | null;
  bmiBand?: string | null;
  med?: string | null;
  productSlug?: string | null;
  productName?: string | null;
  dose?: string | null;
  addProgesterone?: boolean;
  // Whether the buyer chose to use their referral reward (set on the review step); unset means not chosen yet.
  applyReward?: boolean;
}

export function loadAssessment(): Assessment | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? 'null');
  } catch {
    return null;
  }
}

export function saveAssessment(o: Assessment) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORE, JSON.stringify(o));
  } catch {}
}

export function mergeAssessment(o: Partial<Assessment>): Assessment {
  const s = loadAssessment() ?? {};
  const merged = { ...s, ...o };
  saveAssessment(merged);
  return merged;
}
