const KEY = 'th_ref';
// How long a friend's link keeps counting. Without a limit, a link clicked once would attach its reward to
// every quiz ever started in that browser.
export const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Remembers the referral code from a friend's link (?ref=CODE) so it survives the quiz and checkout. */
export function captureReferralCode(now = Date.now()) {
  if (typeof window === 'undefined') return;
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')?.trim();
    if (ref) localStorage.setItem(KEY, JSON.stringify({ code: ref.slice(0, 40), at: now }));
  } catch {}
}

export function loadReferralCode(now = Date.now()): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // An older entry (just the code, with no date) can't be told apart from one clicked long ago: it is dropped.
    if (typeof saved?.code === 'string' && typeof saved.at === 'number' && now - saved.at <= REFERRAL_TTL_MS) return saved.code;
    localStorage.removeItem(KEY);
    return null;
  } catch {
    try { localStorage.removeItem(KEY); } catch {}
    return null;
  }
}

/** Once the order is paid the link has done its job: later quizzes in this browser start without it. */
export function clearReferralCode() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
