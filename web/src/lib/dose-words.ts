import type { IconName } from '@/components/portal/Icon';

/** How a dose is talked about, by the form the medicine takes. */
export type DoseWords = {
  /** "injection", "patch change", "capsule"… */
  one: string;
  many: string;
  /** "Next injection", "Next patch change"… */
  next: string;
  /** What the dose calendar is called in the menu. */
  calendar: string;
  icon: IconName;
  /** Only pens get the pen picture. */
  pen: boolean;
};

const INJECTION: DoseWords = { one: 'injection', many: 'injections', next: 'Next injection', calendar: 'Injections', icon: 'syringe', pen: true };
const DOSE: DoseWords = { one: 'dose', many: 'doses', next: 'Next dose', calendar: 'My doses', icon: 'calendar', pen: false };

/**
 * The words for one dose of this medicine. Weight-loss pens are injections; hormone gels, patches and capsules are not, and
 * a patient told about "injections" for a capsule could take it wrongly. Unknown forms get the neutral "dose".
 */
export function doseWords(form?: string | null): DoseWords {
  switch (form) {
    case 'INJECTION_PEN':
      return INJECTION;
    case 'INJECTION_VIAL':
      return { ...INJECTION, pen: false };
    case 'GEL':
      return { ...DOSE, one: 'application', many: 'applications', next: 'Next application' };
    case 'PATCH':
      return { ...DOSE, one: 'patch change', many: 'patch changes', next: 'Next patch change' };
    case 'TABLET':
      return { ...DOSE, one: 'tablet', many: 'tablets', next: 'Next tablet' };
    case 'CAPSULE':
      return { ...DOSE, one: 'capsule', many: 'capsules', next: 'Next capsule' };
    default:
      return DOSE;
  }
}

/** "1 injection per week", "7 capsules per week"; null when it isn't a whole number. */
export function perWeek(words: DoseWords, n?: number | null): string | null {
  if (n == null) return null;
  if (n === 1) return `1 ${words.one} per week`;
  return Number.isInteger(n) ? `${n} ${words.many} per week` : null;
}
