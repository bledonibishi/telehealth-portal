import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CountBadge } from './NotificationRow';
import { colors } from '../theme';

/** A row in a menu card: an icon, what it opens and a hint, an optional count, and a chevron. */
export function MenuRow({ icon, label, hint, badge, onPress }: { icon: string; label: string; hint: string; badge?: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}>
      <View style={s.icon}><Text style={{ fontSize: 20 }}>{icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.hint}>{hint}</Text>
      </View>
      <CountBadge count={badge ?? 0} />
      <Text style={s.chevron}>›</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  icon: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.ink50, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink900 },
  hint: { fontSize: 12, color: colors.slate500, marginTop: 1 },
  chevron: { fontSize: 24, color: colors.slate300 },
});
