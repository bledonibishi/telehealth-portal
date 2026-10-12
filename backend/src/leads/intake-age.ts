/** How old the health answers on a lead may be when it pays or goes back to its earlier answers. */
export const INTAKE_MAX_AGE_DAYS = 30;
export const intakeIsFresh = (savedAt: Date, now = Date.now()) => now - savedAt.getTime() <= INTAKE_MAX_AGE_DAYS * 86_400_000;
