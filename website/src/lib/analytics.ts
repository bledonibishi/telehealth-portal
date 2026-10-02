// PostHog, for the sales funnel the admin sees (website visits → quiz started → …).
// Off unless NEXT_PUBLIC_POSTHOG_KEY is set; the key is a public project key, not a secret.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '';
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

type PostHog = { init: (key: string, options: Record<string, unknown>) => void; capture: (event: string, props?: Record<string, unknown>) => void };
const ph = (): PostHog | undefined => (typeof window === 'undefined' ? undefined : (window as any).posthog);

export function initAnalytics() {
  if (!KEY || typeof window === 'undefined' || (window as any).__thAnalytics) return;
  (window as any).__thAnalytics = true;

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `${HOST.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/array.js`;
  script.onload = () => ph()?.init(KEY, { api_host: HOST, capture_pageview: 'history_change', persistence: 'localStorage+cookie' });
  document.head.appendChild(script);
}

/** Records an event once PostHog has loaded; silently does nothing when it is off or blocked. */
export function track(event: string, props?: Record<string, unknown>) {
  try {
    ph()?.capture(event, props);
  } catch {
    /* analytics must never break the page */
  }
}
