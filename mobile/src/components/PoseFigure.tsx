import React from 'react';
import { View, StyleSheet } from 'react-native';

export type PoseView = 'FRONT' | 'SIDE';

const GOOD = '#0ea5e9';
const BAD = '#f43f5e';

/**
 * A small figure showing how to stand (good) or what to avoid (bad: feet cut off by the frame, in a bulky hoodie).
 * Drawn from plain views so the app needs no image assets or SVG library.
 */
export function PoseFigure({ view, variant }: { view: PoseView; variant: 'good' | 'bad' }) {
  const color = variant === 'good' ? GOOD : BAD;
  const side = view === 'SIDE';
  const bulky = variant === 'bad';
  const torso = side ? 26 : bulky ? 58 : 42;
  return (
    <View style={[styles.frame, { borderColor: variant === 'good' ? '#bae6fd' : '#fecdd3' }]}>
      {/* Bad: the whole figure sits low, so the frame cuts the legs off. */}
      <View style={[styles.figure, variant === 'bad' && { top: 34 }]}>
        <View style={[styles.head, { backgroundColor: color }]} />
        <View style={styles.body}>
          {!side && <View style={[styles.arm, { backgroundColor: color, marginRight: 3, height: bulky ? 46 : 52 }]} />}
          <View style={[styles.torso, { width: torso, backgroundColor: color, borderRadius: bulky ? 18 : 10 }]} />
          {!side && <View style={[styles.arm, { backgroundColor: color, marginLeft: 3, height: bulky ? 46 : 52 }]} />}
        </View>
        <View style={styles.legs}>
          <View style={[styles.leg, { backgroundColor: color, width: side ? 22 : 14 }]} />
          {!side && <View style={[styles.leg, { backgroundColor: color, width: 14, marginLeft: 6 }]} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 120, height: 170, borderWidth: 2, borderRadius: 16, overflow: 'hidden', alignItems: 'center', backgroundColor: '#fff' },
  figure: { position: 'absolute', top: 8, alignItems: 'center' },
  head: { width: 24, height: 24, borderRadius: 12 },
  body: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  torso: { height: 56 },
  arm: { width: 7, borderRadius: 4 },
  legs: { flexDirection: 'row', marginTop: 4 },
  leg: { height: 78, borderRadius: 7 },
});

const TONES = { neutral: 'rgba(255,255,255,0.85)', good: '#34d399', warn: '#fbbf24' } as const;

/** The outline to fit your body in, on the live camera. Its colour follows the live check. */
export function PoseOutline({ view, tone }: { view: PoseView; tone: keyof typeof TONES }) {
  const c = TONES[tone];
  const side = view === 'SIDE';
  const line = { borderColor: c, borderWidth: 3 };
  return (
    <View style={{ alignItems: 'center', opacity: 0.9 }} pointerEvents="none">
      <View style={[{ width: 46, height: 46, borderRadius: 23 }, line]} />
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {!side && <View style={[{ width: 14, height: 120, borderRadius: 7, marginRight: 6 }, line]} />}
        <View style={[{ width: side ? 56 : 92, height: 130, borderRadius: 24 }, line]} />
        {!side && <View style={[{ width: 14, height: 120, borderRadius: 7, marginLeft: 6 }, line]} />}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        <View style={[{ width: side ? 40 : 34, height: 180, borderRadius: 17 }, line]} />
        {!side && <View style={[{ width: 34, height: 180, borderRadius: 17, marginLeft: 8 }, line]} />}
      </View>
    </View>
  );
}
