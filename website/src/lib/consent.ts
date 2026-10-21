/** The visitor's cookie choice, kept in this browser: 'accepted' lets analytics run, 'declined' keeps it off. Null: not asked yet. */
const KEY = 'th_consent';
export type Consent = 'accepted' | 'declined';

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'accepted' || v === 'declined' ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(value: Consent | null): void {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the choice simply isn't remembered, and analytics stays off */
  }
}
