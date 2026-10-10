import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors } from '../theme';

/** A setting you switch on or off: what it is, a line of explanation, and the switch. */
export function ToggleRow({ label, hint, value, onValueChange, disabled }: {
  label: string; hint?: string; value: boolean; onValueChange: (next: boolean) => void; disabled?: boolean;
}) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{label}</Text>
        {!!hint && <Text style={s.hint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: colors.slate300, true: colors.ink600 }}
        thumbColor={colors.white}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12 },
  label: { fontSize: 15, fontWeight: '600', color: colors.ink900 },
  hint: { fontSize: 12, color: colors.slate500, marginTop: 1 },
});
