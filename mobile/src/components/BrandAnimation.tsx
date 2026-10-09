import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Keyboard, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path as any) as React.ComponentType<any>;

// The drawings, as paths with their (slightly rounded-up) lengths, which the animation needs to "draw" a line.
const SCENES = {
  doctor: [
    ['M80 46a20 20 0 1 0 40 0a20 20 0 1 0 -40 0', 130],
    ['M52 142C52 104 74 84 100 84s48 20 48 58', 175],
    ['M84 86l16 28 16-28', 67],
    ['M74 98c-5 22 2 36 20 36', 51],
    ['M94 134a4 4 0 1 0 8 0a4 4 0 1 0 -8 0', 26],
    ['M128 108h14M135 101v14', 29],
  ],
  pen: [
    ['M36 64h98a6 6 0 0 1 6 6v20a6 6 0 0 1 -6 6h-98a6 6 0 0 1 -6 -6v-20a6 6 0 0 1 6 -6z', 282],
    ['M140 72h18v16h-18', 54],
    ['M158 80h28', 29],
    ['M59 72h34a3 3 0 0 1 3 3v10a3 3 0 0 1 -3 3h-34a3 3 0 0 1 -3 -3v-10a3 3 0 0 1 3 -3z', 111],
    ['M30 72h-14v16h14', 46],
    ['M64 80h24M64 80v0', 25],
  ],
  package: [
    ['M40 56L100 28l60 28v56l-60 28-60-28z', 389],
    ['M40 56l60 28 60-28', 137],
    ['M100 84v56', 58],
    ['M70 42l60 28', 69],
  ],
} as const;

const ORDER = [
  { key: 'doctor', label: 'Your doctor, on your side' },
  { key: 'pen', label: 'Your treatment, step by step' },
  { key: 'package', label: 'Delivered to your door' },
] as const;

const LOOP_MS = 15000;

/**
 * A line drawing that draws itself, holds, and is rubbed out, then the next one: doctor, treatment, delivery.
 * Switched off (a still doctor) when the phone's "reduce motion" setting is on.
 */
export function BrandAnimation({ height = 110, color = colors.brand600, showCaption = true }: { height?: number; color?: string; showCaption?: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState(false);
  const [typing, setTyping] = useState(false);

  // Out of the way while the keyboard is up, so the form keeps the room.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setTyping(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) return setStill(true);
      loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: LOOP_MS, easing: Easing.linear, useNativeDriver: false }));
      loop.start();
    });
    return () => { cancelled = true; loop?.stop(); };
  }, [progress]);

  if (typing) return null;
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={s.wrap}>
      <View style={{ height, aspectRatio: 200 / 160 }}>
        {ORDER.map(({ key }, scene) => {
          const start = scene / 3;
          return (
            <Svg key={key} viewBox="0 0 200 160" style={StyleSheet.absoluteFill}>
              {SCENES[key].map(([d, len], i) => {
                // Hidden, drawn over 11% of the loop, held, rubbed out from the start, hidden again.
                const stagger = i * 0.006;
                const offset = still
                  ? (key === 'doctor' ? 0 : len)
                  : progress.interpolate({
                      inputRange: [0, start + stagger, start + stagger + 0.11, start + stagger + 0.25, start + stagger + 0.31, 1],
                      outputRange: [len, len, 0, 0, -len, -len],
                      extrapolate: 'clamp',
                    });
                return (
                  <AnimatedPath key={i} d={d} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={[len, len]} strokeDashoffset={offset} />
                );
              })}
            </Svg>
          );
        })}
      </View>
      {showCaption && <Caption progress={progress} still={still} />}
    </View>
  );
}

function Caption({ progress, still }: { progress: Animated.Value; still: boolean }) {
  return (
    <View style={s.captionBox}>
      {ORDER.map(({ key, label }, i) => {
        const start = i / 3;
        const opacity = still
          ? (i === 0 ? 1 : 0)
          : progress.interpolate({ inputRange: [0, start, start + 0.04, start + 0.28, start + 0.32, 1], outputRange: [0, 0, 1, 1, 0, 0], extrapolate: 'clamp' });
        return <Animated.Text key={key} style={[s.caption, { opacity }]}>{label}</Animated.Text>;
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center' },
  captionBox: { height: 20, marginTop: 8, alignSelf: 'stretch' },
  caption: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 13, color: colors.slate500 },
});
