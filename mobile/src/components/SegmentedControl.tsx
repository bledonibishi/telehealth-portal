import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

/** Two or three views of the same screen to switch between, each with an optional count. */
export function SegmentedControl<T extends string>({ options, value, onChange }: {
  options: Array<{ value: T; label: string; count?: number }>; value: T; onChange: (next: T) => void;
}) {
  return (
    <View style={s.track} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[s.item, active && s.itemActive]}
          >
            <Text style={[s.label, active && s.labelActive]}>{o.label}</Text>
            {!!o.count && (
              <View style={[s.count, active ? s.countActive : s.countIdle]}>
                <Text style={[s.countText, active && { color: colors.white }]}>{o.count > 99 ? '99+' : o.count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.slate100, borderRadius: 12, padding: 3, marginBottom: 12 },
  item: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  itemActive: { backgroundColor: colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  label: { fontSize: 13, fontWeight: '600', color: colors.slate500 },
  labelActive: { color: colors.ink900 },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  countActive: { backgroundColor: colors.danger },
  countIdle: { backgroundColor: colors.slate200 },
  countText: { fontSize: 11, fontWeight: '700', color: colors.slate600 },
});
