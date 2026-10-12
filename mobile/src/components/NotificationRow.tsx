import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NotificationTone } from '@telehealth/shared-types';
import { colors } from '../theme';

const TILE: Record<NotificationTone, string> = { urgent: colors.red100, warning: colors.amber100, info: colors.ink50, success: colors.emerald100 };

/** One notification in a list: an icon tile coloured by tone, the title, a line of detail, when; a dot and a tint while unread. */
export function NotificationRow({ title, body, time, icon = '🔔', tone = 'info', unread = false, onPress }: {
  title: string; body: string; time: string; icon?: string; tone?: NotificationTone; unread?: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${title}. ${body}. ${time}`}
      style={({ pressed }) => [s.row, unread && s.unread, pressed && { opacity: 0.8 }]}
    >
      <View style={[s.tile, { backgroundColor: unread ? TILE[tone] : colors.slate100 }, !unread && { opacity: 0.7 }]}><Text style={{ fontSize: 18 }}>{icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, unread && s.titleUnread]}>{title}</Text>
        <Text style={s.body}>{body}</Text>
        {!!time && <Text style={s.time}>{time}</Text>}
      </View>
      {unread ? <View style={s.dot} /> : <Text style={s.chevron}>›</Text>}
    </Pressable>
  );
}

/** A small red count, e.g. unread notifications on a menu row. Shows nothing at 0. */
export function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={s.badge} accessibilityLabel={`${count} unread`}>
      <Text style={s.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 14 },
  unread: { backgroundColor: colors.ink50 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger, alignSelf: 'center' },
  title: { fontSize: 15, color: colors.slate700 },
  titleUnread: { fontWeight: '700', color: colors.ink900 },
  body: { fontSize: 13, color: colors.slate500, marginTop: 2 },
  time: { fontSize: 11, color: colors.slate400, marginTop: 3 },
  chevron: { fontSize: 22, color: colors.slate300, alignSelf: 'center' },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '700' },
});
