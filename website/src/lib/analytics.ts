// PostHog, for the sales funnel the admin sees (website visits → quiz started → …).
// Off unless NEXT_PUBLIC_POSTHOG_KEY is set; the key is a public project key, not a secret.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '';
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

type PostHog = { __loaded?: boolean; init: (key: string, options: Record<string, unknown>) => void; capture: (event: string, props?: Record<string, unknown>) => void; reset?: () => void };
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

/**
 * Forgets this browser's analytics identity, for a visitor who withdraws consent: PostHog's own reset, then what it
 * keeps in local storage, session storage and its cookie (all named ph_<project key>_…). Safe when PostHog never ran.
 */
export function forgetAnalytics() {
  if (typeof window === 'undefined') return;
  try {
    ph()?.reset?.();
  } catch {
    /* not loaded */
  }
  for (const store of [localStorage, sessionStorage]) {
    try {
      for (const key of Object.keys(store)) if (key.startsWith('ph_') || key.startsWith('__ph')) store.removeItem(key);
    } catch {
      /* storage blocked: nothing was kept there */
    }
  }
  // The cookie may sit on this host or on the parent domain (PostHog shares it across subdomains).
  const host = window.location.hostname;
  const domains = ['', host, `.${host.split('.').slice(-2).join('.')}`];
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim();
    if (!name.startsWith('ph_')) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}
