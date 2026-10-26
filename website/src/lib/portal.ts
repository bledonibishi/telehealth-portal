'use client';

/* The "portal" between the clinic site and the shop: a full-screen transition played while the next page loads.
   A link asks for it with goThroughPortal(); <PortalTransition /> in the root layout plays it. */

export type PortalTheme = 'shop' | 'clinic';

export interface PortalRequest {
  href: string;
  /** Where the click was, so the transition grows from the button that was pressed. */
  x: number;
  y: number;
  theme: PortalTheme;
}

export const PORTAL_EVENT = 'omo-portal';

export function goThroughPortal(request: PortalRequest) {
  window.dispatchEvent(new CustomEvent<PortalRequest>(PORTAL_EVENT, { detail: request }));
}

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
