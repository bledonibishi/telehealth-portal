import { useSyncExternalStore } from 'react';
import { createClient } from 'graphql-ws';

// Same file lives in web/src/lib and clinician/src/lib — keep them identical.

// Refresh a token this close to expiry rather than connecting with one that dies mid-handshake.
const EXPIRY_SKEW_MS = 60_000;

function expiresSoon(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 - Date.now() < EXPIRY_SKEW_MS;
  } catch {
    return false;
  }
}

// The socket authenticates a subscription with the token it connected with, so a
// long-lived socket silently rejects new subscriptions once that token expires (15 min).
// This wrapper connects with a fresh token, reconnects when the token is refreshed,
// never gives up retrying, and reports whether the socket is up so screens can fall back
// to polling while it isn't.
export function createRealtime({
  url, getToken, refreshToken, webSocketImpl,
}: {
  url: string;
  getToken: () => string | null;
  refreshToken: () => Promise<string | null>;
  webSocketImpl?: unknown;
}) {
  let connected = false;
  let connects = 0;
  const statusListeners = new Set<() => void>();
  const reconnectListeners = new Set<() => void>();

  const setConnected = (value: boolean) => {
    if (connected === value) return;
    connected = value;
    statusListeners.forEach((l) => l());
  };

  const client = createClient({
    url,
    webSocketImpl,
    retryAttempts: Infinity,
    // By default only close events are retried, so a refused connection — the backend
    // restarting, as `nest start --watch` does on every save — ends the subscription for good.
    // Fatal close codes (e.g. unauthorised) are still surfaced before this is consulted.
    shouldRetry: () => true,
    // The default waits 1–4s even before the first retry; reconnect quickly, then back off.
    retryWait: (retries) =>
      new Promise((resolve) => setTimeout(resolve, retries === 0 ? 250 : Math.min(1000 * 2 ** (retries - 1), 15_000) + Math.random() * 500)),
    connectionParams: async () => {
      let token = getToken();
      if (!token || expiresSoon(token)) token = (await refreshToken()) ?? token;
      return token ? { authorization: `Bearer ${token}` } : {};
    },
    on: {
      connected: () => {
        connects += 1;
        setConnected(true);
        // Anything sent while the socket was down was missed, so let screens refetch.
        if (connects > 1) reconnectListeners.forEach((l) => l());
      },
      closed: () => setConnected(false),
    },
  });

  return {
    client,
    isConnected: () => connected,
    // Reconnect so live subscriptions re-authenticate with a newly refreshed token.
    reconnect: () => client.terminate(),
    subscribeStatus(listener: () => void) {
      statusListeners.add(listener);
      return () => { statusListeners.delete(listener); };
    },
    onReconnect(listener: () => void) {
      reconnectListeners.add(listener);
      return () => { reconnectListeners.delete(listener); };
    },
  };
}

export type Realtime = ReturnType<typeof createRealtime>;

export function useRealtimeConnected(realtime: Realtime | null): boolean {
  return useSyncExternalStore(
    (listener) => realtime?.subscribeStatus(listener) ?? (() => {}),
    () => realtime?.isConnected() ?? false,
    () => true,
  );
}
