import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';

/** The round button at the top right of a screen that opens the profile and settings: the patient's initials. */
export function ProfileButton({ initials, onPress }: { initials: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Profile and settings" hitSlop={8} style={({ pressed }) => [s.button, pressed && { opacity: 0.8 }]}>
      <Text style={s.initials}>{initials || '👤'}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink700, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 14, fontWeight: '800', color: colors.white },
});
