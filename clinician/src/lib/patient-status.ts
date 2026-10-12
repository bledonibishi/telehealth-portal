// How a patient's treatment status reads everywhere in the portal.
// Active: activated and on a current prescription. Inactive: activated but not
// on treatment (not started, or stopped). Declined: every consultation was declined.
// Pending: hasn't activated yet.
export type TreatmentStatus = 'ACTIVE' | 'INACTIVE' | 'DECLINED' | 'PENDING';

export const TREATMENT_STATUS: Record<TreatmentStatus, { label: string; cls: string; dot: string; rank: number; dark: string }> = {
  ACTIVE: { label: 'Active', cls: 'bg-green-50 text-green-700', dot: 'bg-green-500', rank: 0, dark: 'bg-emerald-500/15 text-emerald-300' },
  INACTIVE: { label: 'Inactive', cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400', rank: 1, dark: 'bg-rose-500/15 text-rose-300' },
  DECLINED: { label: 'Declined', cls: 'bg-red-50 text-red-700', dot: 'bg-red-500', rank: 3, dark: 'bg-red-500/15 text-red-300' },
  PENDING: { label: 'Awaiting activation', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400', rank: 2, dark: 'bg-amber-500/15 text-amber-300' },
};

// A weight-programme patient who hasn't weighed in for this long needs a nudge.
export const STALE_WEIGH_IN_DAYS = 35;
