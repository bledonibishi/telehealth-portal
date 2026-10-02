const KEY = 'th_ref';

/** Remembers the referral code from a friend's link (?ref=CODE) so it survives the quiz and checkout. */
export function captureReferralCode() {
  if (typeof window === 'undefined') return;
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')?.trim();
    if (ref) localStorage.setItem(KEY, ref.slice(0, 40));
  } catch {}
}

export function loadReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
