import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../theme';
import { Card } from './ui';

// One pulse shared by every placeholder on screen, so ten skeletons run one animation, not ten. It runs only while at
// least one is mounted. With "reduce motion" on, they stay still.
const pulse = new Animated.Value(0);
let mounted = 0;
let loop: Animated.CompositeAnimation | null = null;
const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] });

function usePulse() {
  const [still, setStill] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill);
  }, []);
  useEffect(() => {
    if (still) return;
    if (mounted++ === 0) {
      const step = (toValue: number) => Animated.timing(pulse, { toValue, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
      loop = Animated.loop(Animated.sequence([step(1), step(0)]));
      loop.start();
    }
    return () => {
      if (--mounted === 0) {
        loop?.stop();
        loop = null;
      }
    };
  }, [still]);
  return still ? 1 : opacity;
}

/** A grey block that stands in for content that is loading. Give it a size; it is the building block of the rest. */
export function Skeleton({ width = '100%', height = 12, radius = 6, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const o = usePulse();
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.slate200, opacity: o }, style]} />;
}

/** Announces the wait once for the whole placeholder, and keeps the individual shapes silent. */
function Region({ label, children, style }: { label: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }} importantForAccessibility="yes" style={style}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>{children}</View>
    </View>
  );
}

export function SkeletonText({ lines = 3, label = 'Loading…' }: { lines?: number; label?: string }) {
  return (
    <Region label={label}>
      <View style={s.gap}>
        {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i === lines - 1 && lines > 1 ? '60%' : '100%'} />)}
      </View>
    </Region>
  );
}

/** A card with a title line and a few lines of text: an order, a report, a plan. */
export function SkeletonCard({ lines = 3, label = 'Loading…' }: { lines?: number; label?: string }) {
  return (
    <Card>
      <Region label={label}>
        <View style={s.gapLarge}>
          <Skeleton width="40%" height={16} />
          <View style={s.gap}>
            {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i === lines - 1 ? '65%' : '100%'} />)}
          </View>
        </View>
      </Region>
    </Card>
  );
}

/** Rows with a round picture and two lines: notifications, conversations, the care team. */
export function SkeletonRows({ rows = 4, label = 'Loading…' }: { rows?: number; label?: string }) {
  return (
    <Region label={label}>
      <View style={s.gapLarge}>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={s.row}>
            <Skeleton width={36} height={36} radius={18} />
            <View style={[s.gap, { flex: 1 }]}>
              <Skeleton width="55%" />
              <Skeleton width="85%" height={10} />
            </View>
          </View>
        ))}
      </View>
    </Region>
  );
}

/** A spinner and a label, for a screen that waits and has no shape to show. `fill` centres it in the whole screen. */
export function LoadingState({ label = 'Loading…', fill = false }: { label?: string; fill?: boolean }) {
  return (
    <View accessible accessibilityLabel={label} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }} style={[s.loading, fill && s.fill]}>
      <ActivityIndicator color={colors.brand600} />
      <Text style={s.loadingText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  gap: { gap: 8 },
  gapLarge: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loading: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 },
  fill: { flex: 1 },
  loadingText: { fontSize: 13, color: colors.slate500 },
});
