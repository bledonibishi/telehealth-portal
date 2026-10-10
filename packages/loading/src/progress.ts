'use client';
import { useSyncExternalStore } from 'react';

/**
 * What the top bar listens to: how many requests are in flight and whether a page change is under way. Anything can
 * report into it (the Apollo link does, so every GraphQL call counts). Plain module state: no provider to mount.
 */
let requests = 0;
let route = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const progress = {
  beginRequest() { requests++; emit(); },
  endRequest() { requests = Math.max(0, requests - 1); emit(); },
  beginRoute() { if (!route) { route = true; emit(); } },
  endRoute() { if (route) { route = false; emit(); } },
};

/** 0 idle, 1 requests in flight, 2 moving to another page. A number, so React can compare it cheaply. */
export type Busy = 0 | 1 | 2;
const snapshot = (): Busy => (route ? 2 : requests > 0 ? 1 : 0);
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useBusy(): Busy {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

/** Counts a promise as a request for the top bar, for work that does not go through Apollo (a fetch, an upload). */
export async function trackProgress<T>(work: Promise<T>): Promise<T> {
  progress.beginRequest();
  try {
    return await work;
  } finally {
    progress.endRequest();
  }
}
