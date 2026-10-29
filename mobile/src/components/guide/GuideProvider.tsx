import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useIsFocused } from '@react-navigation/native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EMPTY_GUIDE_STATE, GUIDE_STORAGE_KEY, findShowableStep, markSeen, parseGuideState, serializeGuideState, stepPosition,
  type GuideState, type GuideTour,
} from '@telehealth/guide';
import { GuideOverlay, type GuideRect } from './GuideOverlay';
import { GuideContext, measureView, useGuide, type GuideContextValue, type Measure } from './GuideContext';
import { BottomSheet } from '../BottomSheet';
import { MenuRow } from '../MenuRow';
import { Button, Card } from '../ui';

// The app guide on the phone. `GuideProvider` wraps the app and draws the overlay; `GuideTarget` marks something a tour
// can point at; `GuideTabBar` makes each tab a target (`tab:<route name>`); `useScreenGuide` gives a screen its own tour,
// started the first time the screen is opened with the guide on. Tours: lib/guideTours.ts. See packages/guide/README.md.

type Active = { tour: GuideTour; index: number; rects: Record<string, GuideRect | null> };

export function GuideProvider({ welcome, children }: { welcome: GuideTour; children: React.ReactNode }) {
  const [state, setState] = React.useState<GuideState>(EMPTY_GUIDE_STATE);
  const [ready, setReady] = React.useState(false);
  const [active, setActive] = React.useState<Active | null>(null);
  const [screenTour, setScreenTour] = React.useState<GuideTour | null>(null);
  const targets = React.useRef(new Map<string, Set<Measure>>());
  const screen = useWindowDimensions();

  React.useEffect(() => {
    SecureStore.getItemAsync(GUIDE_STORAGE_KEY)
      .then((raw) => setState(parseGuideState(raw)))
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const update = React.useCallback((fn: (s: GuideState) => GuideState) => {
    setState((s) => {
      const next = fn(s);
      SecureStore.setItemAsync(GUIDE_STORAGE_KEY, serializeGuideState(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const register = React.useCallback((id: string, measure: Measure) => {
    const set = targets.current.get(id) ?? new Set<Measure>();
    set.add(measure);
    targets.current.set(id, set);
    return () => { set.delete(measure); };
  }, []);

  // Where each target of the tour is now. Only one fully on screen counts: a screen behind another tab measures as nothing.
  const measureTour = React.useCallback(async (tour: GuideTour) => {
    const rects: Record<string, GuideRect | null> = {};
    for (const id of new Set(tour.steps.map((s) => s.target).filter((t): t is string => !!t))) {
      rects[id] = null;
      for (const measure of targets.current.get(id) ?? []) {
        const r = await measure();
        if (r && r.width > 0 && r.height > 0 && r.x >= -1 && r.y >= -1 && r.x + r.width <= screen.width + 1 && r.y + r.height <= screen.height + 1) { rects[id] = r; break; }
      }
    }
    return rects;
  }, [screen.width, screen.height]);

  const startTour = React.useCallback(async (tour: GuideTour) => {
    const rects = await measureTour(tour);
    const first = findShowableStep(tour.steps, 0, 1, (id) => !!rects[id]);
    if (first >= 0) setActive({ tour, index: first, rects });
  }, [measureTour]);

  const finish = React.useCallback(() => {
    if (active) update((s) => markSeen(s, active.tour.id));
    setActive(null);
  }, [active, update]);

  const go = async (direction: 1 | -1) => {
    if (!active) return;
    const rects = await measureTour(active.tour);
    const next = findShowableStep(active.tour.steps, active.index + direction, direction, (id) => !!rects[id]);
    if (next >= 0) setActive({ ...active, index: next, rects });
    else if (direction === 1) finish();
  };

  const setEnabled = React.useCallback((on: boolean) => {
    update((s) => ({ ...s, enabled: on }));
    if (on) startTour(welcome); else setActive(null);
  }, [update, startTour, welcome]);

  const value = React.useMemo<GuideContextValue>(() => ({
    ready, enabled: state.enabled, setEnabled, startTour, running: !!active, seen: state.seen, register, setScreenTour, screenTour, welcome,
  }), [ready, state.enabled, state.seen, setEnabled, startTour, active, register, screenTour, welcome]);

  const step = active?.tour.steps[active.index];
  const onScreen = (id: string) => !!active?.rects[id];
  const position = active ? stepPosition(active.tour.steps, active.index, onScreen) : null;

  return (
    <GuideContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {active && step && position && (
          <GuideOverlay
            rect={step.target ? active.rects[step.target] ?? null : null}
            screen={screen}
            tourTitle={active.tour.title}
            title={step.title}
            body={step.body}
            n={position.n}
            total={position.total}
            first={findShowableStep(active.tour.steps, active.index - 1, -1, onScreen) < 0}
            last={findShowableStep(active.tour.steps, active.index + 1, 1, onScreen) < 0}
            onBack={() => go(-1)}
            onNext={() => go(1)}
            onClose={finish}
          />
        )}
      </View>
    </GuideContext.Provider>
  );
}

/** The normal tab bar, with each tab a guide target named `tab:<route name>`. Tabs share the bar's width equally. */
export function GuideTabBar(props: BottomTabBarProps) {
  const ref = React.useRef<View>(null);
  const { register } = useGuide();
  const names = props.state.routes.map((r) => r.name).join('|');
  React.useEffect(() => {
    const routes = names.split('|');
    const offs = routes.map((name, i) => register(`tab:${name}`, async () => {
      const bar = await measureView(ref);
      if (!bar) return null;
      const width = bar.width / routes.length;
      return { x: bar.x + width * i, y: bar.y, width, height: bar.height };
    }));
    return () => offs.forEach((off) => off());
  }, [names, register]);
  return <View ref={ref} collapsable={false}><BottomTabBar {...props} /></View>;
}

/** Gives a screen its tour: started the first time the screen is in front with the guide on, and offered by the Guide button. */
export function useScreenGuide(tour: GuideTour) {
  const { ready, enabled, running, seen, startTour, setScreenTour } = useGuide();
  const focused = useIsFocused();
  React.useEffect(() => {
    if (!focused) return;
    setScreenTour(tour);
    // Only if no other screen has put its tour in since.
    return () => setScreenTour((current) => (current === tour ? null : current));
  }, [focused, tour, setScreenTour]);
  React.useEffect(() => {
    if (!ready || !enabled || !focused || running || seen.includes(tour.id)) return;
    // The wait lets the screen draw what the tour explains.
    const timer = setTimeout(() => startTour(tour), 900);
    return () => clearTimeout(timer);
  }, [ready, enabled, focused, running, seen, tour, startTour]);
}

/** While the guide is on: a Guide button over the tab bar, to replay a tour or switch the guide off. */
export function GuideLauncher() {
  const { ready, enabled, running, screenTour, startTour, setEnabled, welcome } = useGuide();
  const [open, setOpen] = React.useState(false);
  const insets = useSafeAreaInsets();
  if (!ready || !enabled || running) return null;
  const pick = (fn: () => void) => { setOpen(false); fn(); };
  return (
    <>
      <View style={[s.launcher, { bottom: insets.bottom + 64 }]} pointerEvents="box-none">
        <Button label="? Guide" small onPress={() => setOpen(true)} />
      </View>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="App guide">
        <Card style={{ padding: 6 }}>
          {screenTour && <MenuRow icon="🧭" label="Guide me through this screen" hint={screenTour.title} onPress={() => pick(() => startTour(screenTour))} />}
          <MenuRow icon="🗺️" label="Tour of the whole app" hint="Every tab and what it is for" onPress={() => pick(() => startTour(welcome))} />
          <MenuRow icon="🔕" label="Turn the guide off" hint="Switch it on again under More" onPress={() => pick(() => setEnabled(false))} />
        </Card>
      </BottomSheet>
    </>
  );
}

const s = StyleSheet.create({
  launcher: { position: 'absolute', right: 16 },
});
export { GuideTarget, useGuide } from './GuideContext';
