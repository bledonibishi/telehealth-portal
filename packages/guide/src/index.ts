// The app guide, for every app: the shape of a tour and the rules every app follows to walk one. The web portals use
// `@telehealth/guide/web` (the overlay for the browser); the mobile app has its own overlay in `mobile/src/components/guide`.
// See README.md.

/** Where the explanation sits next to what it points at. `auto` picks the side with the most room; `right` suits a menu. */
export type GuidePlacement = 'auto' | 'top' | 'bottom' | 'right';

export type GuideStep = {
  /**
   * What to highlight: the `data-guide` value on the web, the `GuideTarget` id on mobile. Leave it out for a step that
   * is only an explanation (shown in the middle of the screen). A step whose target is not on screen — a menu item this
   * role does not have, a list that is empty — is skipped, so one tour fits every role.
   */
  target?: string;
  title: string;
  body: string;
  placement?: GuidePlacement;
};

export type GuideTour = {
  /** Stable: it is how the app remembers the tour was seen. Change it to show a rewritten tour again. */
  id: string;
  title: string;
  steps: GuideStep[];
};

/** What each device remembers: whether the guide is on, and which tours it has already walked through. */
export type GuideState = { enabled: boolean; seen: string[] };

export const GUIDE_STORAGE_KEY = 'omo.guide';
export const EMPTY_GUIDE_STATE: GuideState = { enabled: false, seen: [] };

export function parseGuideState(raw: string | null | undefined): GuideState {
  if (!raw) return EMPTY_GUIDE_STATE;
  try {
    const v = JSON.parse(raw);
    return {
      enabled: v?.enabled === true,
      seen: Array.isArray(v?.seen) ? v.seen.filter((x: unknown): x is string => typeof x === 'string') : [],
    };
  } catch {
    return EMPTY_GUIDE_STATE;
  }
}

export const serializeGuideState = (state: GuideState) => JSON.stringify(state);

export function markSeen(state: GuideState, tourId: string): GuideState {
  return state.seen.includes(tourId) ? state : { ...state, seen: [...state.seen, tourId] };
}

/**
 * The next step that can be shown, walking from `from` in `direction` (1 forward, -1 back), `from` itself included.
 * -1 when there is none left that way.
 */
export function findShowableStep(steps: GuideStep[], from: number, direction: 1 | -1, isOnScreen: (target: string) => boolean): number {
  for (let i = from; i >= 0 && i < steps.length; i += direction) {
    const target = steps[i].target;
    if (!target || isOnScreen(target)) return i;
  }
  return -1;
}

/** "2 of 5", counting only the steps that can be shown right now. */
export function stepPosition(steps: GuideStep[], index: number, isOnScreen: (target: string) => boolean): { n: number; total: number } {
  const showable = steps.map((s, i) => ({ s, i })).filter(({ s }) => !s.target || isOnScreen(s.target));
  return { n: Math.max(1, showable.findIndex(({ i }) => i === index) + 1), total: Math.max(1, showable.length) };
}
