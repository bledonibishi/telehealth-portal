import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SITE_LABEL, SITE_ROTATION, type InjectionSite } from '../../lib/injectionSites';
import { colors } from '../../theme';

// A front view, so the patient's left is on the right of the picture. Offsets are from the figure's top-left.
const ZONES: Record<InjectionSite, { left: number; top: number; size: number }> = {
  ARM_RIGHT: { left: 8, top: 84, size: 30 },
  ABDOMEN_RIGHT: { left: 58, top: 104, size: 38 },
  ABDOMEN_LEFT: { left: 104, top: 104, size: 38 },
  ARM_LEFT: { left: 166, top: 84, size: 30 },
  THIGH_RIGHT: { left: 60, top: 172, size: 36 },
  THIGH_LEFT: { left: 106, top: 172, size: 36 },
};

/** A simple body with the six injection spots, and the same six as buttons under it. The suggested spot is ringed. */
export function SitePicker({ value, suggested, last, onChange }: { value: InjectionSite | null; suggested: InjectionSite; last: InjectionSite | null; onChange: (s: InjectionSite) => void }) {
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.figure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.part, { left: 78, top: 0, width: 48, height: 48, borderRadius: 24 }]} />
          <View style={[styles.part, { left: 56, top: 54, width: 92, height: 112, borderRadius: 26 }]} />
          <View style={[styles.part, { left: 12, top: 60, width: 36, height: 96, borderRadius: 18 }]} />
          <View style={[styles.part, { left: 156, top: 60, width: 36, height: 96, borderRadius: 18 }]} />
          <View style={[styles.part, { left: 58, top: 160, width: 40, height: 100, borderRadius: 20 }]} />
          <View style={[styles.part, { left: 106, top: 160, width: 40, height: 100, borderRadius: 20 }]} />
          {SITE_ROTATION.map((site) => {
            const z = ZONES[site];
            const chosen = value === site;
            return (
              <Pressable
                key={site}
                onPress={() => onChange(site)}
                hitSlop={6}
                style={[
                  styles.zone,
                  { left: z.left, top: z.top, width: z.size, height: z.size, borderRadius: z.size / 2 },
                  site === last && styles.zoneLast,
                  chosen && styles.zoneChosen,
                  site === suggested && styles.zoneSuggested,
                ]}
              />
            );
          })}
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.legend}>Try today: <Text style={styles.legendBold}>{SITE_LABEL[suggested].toLowerCase()}</Text></Text>
          {last && <Text style={styles.legend}>Last time: {SITE_LABEL[last].toLowerCase()}</Text>}
          <Text style={styles.tiny}>Left and right are yours, so your left is on the right of the picture.</Text>
        </View>
      </View>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {SITE_ROTATION.map((site) => {
          const on = value === site;
          return (
            <Pressable key={site} onPress={() => onChange(site)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{SITE_LABEL[site]}{site === suggested ? ' ★' : ''}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  figure: { width: 204, height: 262 },
  part: { position: 'absolute', backgroundColor: colors.slate100, borderWidth: 1, borderColor: colors.slate200 },
  zone: { position: 'absolute', backgroundColor: colors.white, borderWidth: 2, borderColor: colors.slate400 },
  zoneLast: { backgroundColor: colors.red200 },
  zoneSuggested: { borderColor: colors.ink600, borderStyle: 'dashed', borderWidth: 3 },
  zoneChosen: { backgroundColor: colors.ink600, borderColor: colors.ink700, borderStyle: 'solid' },
  legend: { fontSize: 13, color: colors.slate600 },
  legendBold: { fontWeight: '700', color: colors.slate900 },
  tiny: { fontSize: 11, color: colors.slate400, lineHeight: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { borderWidth: 1, borderColor: colors.slate200, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.ink50, borderColor: colors.ink600 },
  chipText: { fontSize: 13, color: colors.slate600 },
  chipTextOn: { color: colors.ink800, fontWeight: '700' },
});
