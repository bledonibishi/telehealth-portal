import React from 'react';
import { View } from 'react-native';
import type { GuideTour } from '@telehealth/guide';
import type { GuideRect } from './GuideOverlay';

// The guide's context and `GuideTarget`, apart from the provider so that the basic components (ui.tsx) can mark targets
// without importing the provider, which itself uses them.

export type Measure = () => Promise<GuideRect | null>;

export type GuideContextValue = {
  ready: boolean;
  enabled: boolean;
  /** Turning it on starts the tour of the app straight away. */
  setEnabled: (on: boolean) => void;
  startTour: (tour: GuideTour) => void;
  running: boolean;
  seen: string[];
  register: (id: string, measure: Measure) => () => void;
  /** The tour of the screen in front, for the Guide button. */
  setScreenTour: React.Dispatch<React.SetStateAction<GuideTour | null>>;
  screenTour: GuideTour | null;
  welcome: GuideTour;
};

export const GuideContext = React.createContext<GuideContextValue | null>(null);

export function useGuide() {
  const value = React.useContext(GuideContext);
  if (!value) throw new Error('useGuide must be used inside GuideProvider');
  return value;
}

export function measureView(ref: React.RefObject<View | null>): Promise<GuideRect | null> {
  return new Promise((resolve) => {
    const view = ref.current;
    if (!view) return resolve(null);
    // A view that is being taken off screen may never answer.
    const timer = setTimeout(() => resolve(null), 300);
    view.measureInWindow((x, y, width, height) => { clearTimeout(timer); resolve({ x, y, width, height }); });
  });
}

/** Something a tour can point at. `id` is the step's `target`. */
export function GuideTarget({ id, children, style }: { id: string; children: React.ReactNode; style?: React.ComponentProps<typeof View>['style'] }) {
  const ref = React.useRef<View>(null);
  // Outside the provider (Storybook) it is just a view.
  const register = React.useContext(GuideContext)?.register;
  React.useEffect(() => register?.(id, () => measureView(ref)), [id, register]);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}
