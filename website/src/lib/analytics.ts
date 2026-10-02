// PostHog, for the sales funnel the admin sees (website visits → quiz started → …).
// Off unless NEXT_PUBLIC_POSTHOG_KEY is set; the key is a public project key, not a secret.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '';
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

type PostHog = { __loaded?: boolean; init: (key: string, options: Record<string, unknown>) => void; capture: (event: string, props?: Record<string, unknown>) => void };
const ph = (): PostHog | undefined => (typeof window === 'undefined' ? undefined : (window as any).posthog);

// Events fired before PostHog has finished loading (a visitor can answer the first quiz question
// before the script arrives) wait here and are sent once it is ready, instead of being lost.
const MAX_QUEUED = 50;
const queued: Array<[string, Record<string, unknown> | undefined]> = [];
let ready = false;

export function initAnalytics() {
  if (!KEY || typeof window === 'undefined' || (window as any).__thAnalytics) return;
  (window as any).__thAnalytics = true;

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `${HOST.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/array.js`;
  script.onload = () => {
    ph()?.init(KEY, { api_host: HOST, capture_pageview: 'history_change', persistence: 'localStorage+cookie' });
    ready = true;
    for (const [event, props] of queued.splice(0)) send(event, props);
  };
  document.head.appendChild(script);
}

const send = (event: string, props?: Record<string, unknown>) => {
  try {
    ph()?.capture(event, props);
  } catch {
    /* analytics must never break the page */
  }
};

/** Records an event; held back until PostHog has loaded, and silently dropped when it is off or blocked. */
export function track(event: string, props?: Record<string, unknown>) {
  if (!KEY || typeof window === 'undefined') return;
  if (ready || ph()?.__loaded) return send(event, props);
  if (queued.length < MAX_QUEUED) queued.push([event, props]);
}
