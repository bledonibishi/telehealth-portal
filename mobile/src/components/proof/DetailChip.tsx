import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

// Mirrors web/src/components/onboarding/DetailChip.tsx.

export type Field = 'NAME' | 'MEDICINE' | 'DOSE' | 'DATE';
export type ChipState = 'shown' | 'flagged' | 'missing';

export const FIELDS: { key: Field; n: number; label: string }[] = [
  { key: 'NAME', n: 1, label: 'Name' },
  { key: 'MEDICINE', n: 2, label: 'Medicine' },
  { key: 'DOSE', n: 3, label: 'Dose' },
  { key: 'DATE', n: 4, label: 'Date' },
];

/** What each detail means, shown when its chip is tapped. */
export const DETAIL_INFO: Record<Field, string> = {
  NAME: 'Your full name, as on your account',
  MEDICINE: 'The medicine, e.g. Wegovy or Mounjaro',
  DOSE: 'The strength, e.g. 2.5 mg',
  DATE: 'When it was dispensed — within the last 3 months',
};

export const MISSING_INFO = 'Not on this one — the pharmacy label has it';

const TONE: Record<ChipState, { bg: string; text: string; badgeBg: string; badgeText: string }> = {
  shown: { bg: colors.brand50, text: colors.brand800, badgeBg: colors.brand600, badgeText: colors.white },
  flagged: { bg: colors.amber50, text: colors.amber800, badgeBg: colors.amber500, badgeText: colors.white },
  missing: { bg: colors.slate50, text: colors.slate400, badgeBg: colors.slate200, badgeText: colors.slate500 },
};

// How long each detail is spotlit during the tour.
const SPOTLIGHT_MS = 1800;

/**
 * Which detail is spotlit. On each new `restartKey` (e.g. a new slide) the details are shown once,
 * in order — a short tour — and then nothing is, until the patient taps one (`open`).
 */
export function useSpotlight<K extends string>(keys: K[], open: K | null, restartKey?: unknown): K | null {
  const [spot, setSpot] = useState(0);
  useEffect(() => setSpot(0), [restartKey]);
  useEffect(() => {
    if (spot >= keys.length) return; // tour over
    const t = setTimeout(() => setSpot((s) => s + 1), SPOTLIGHT_MS);
    return () => clearTimeout(t);
  }, [spot, keys.length, restartKey]);
  return open ?? (spot < keys.length ? keys[spot] : null);
}

/**
 * A value that breathes between 1 and `max` on a loop — the spotlit outline's scale. Stays at 1
 * when the phone's "reduce motion" setting is on.
 */
export function usePulse(max = 1.12) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: max, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse, max]);
  return pulse;
}

/** A numbered chip for one detail the check reads. Tapping it shows its explanation (see DetailInfo). */
export function DetailChip({
  n,
  label,
  state,
  open,
  highlighted = false,
  onToggle,
}: {
  n: number;
  label: string;
  state: ChipState;
  open: boolean;
  /** Lit up without being opened: its outline on the photo is the one spotlit right now. */
  highlighted?: boolean;
  onToggle: () => void;
}) {
  const tone = TONE[state];
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={[styles.chip, { backgroundColor: tone.bg, borderColor: open || highlighted ? tone.text : 'transparent' }]}
    >
      <View style={[styles.badge, { backgroundColor: tone.badgeBg }]}>
        <Text style={[styles.badgeText, { color: tone.badgeText }]}>{state === 'missing' ? '✗' : n}</Text>
      </View>
      <Text style={[styles.label, { color: tone.text }, state === 'missing' && styles.strike]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A line of text that crossfades to a chip's explanation while one is open, and back to `idle`
 * when none is. Both texts sit in the same place, so the line never moves.
 */
export function DetailInfo({ idle, info, open }: { idle: string; info: React.ReactNode; open: boolean }) {
  const fade = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: open ? 1 : 0, duration: 250, useNativeDriver: true }).start();
  }, [open, fade]);

  return (
    <View style={styles.info} accessibilityLiveRegion="polite">
      <Animated.Text style={[styles.infoText, { color: colors.slate600, opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        {idle}
      </Animated.Text>
      <Animated.Text style={[styles.infoText, styles.infoLayer, { color: colors.slate800, opacity: fade }]}>{info}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingLeft: 2, paddingRight: 9, paddingVertical: 2, borderWidth: 1.5 },
  badge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '500' },
  strike: { textDecorationLine: 'line-through' },
  info: { marginTop: 8, minHeight: 34, justifyContent: 'center' },
  infoText: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  infoLayer: { position: 'absolute', left: 0, right: 0 },
});
