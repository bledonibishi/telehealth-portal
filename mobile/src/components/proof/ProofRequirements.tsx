import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

// Mirrors web/src/components/onboarding/ProofRequirements.tsx.

export type ProofRequirementsData = {
  name?: string | null;
  medicine?: string | null;
  dose?: string | null;
  notBefore: string; // YYYY-MM-DD
};

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * What this patient's proof has to show to be accepted — their name, the medicine and dose they
 * told us, and a recent date — numbered like the details outlined in the example photos.
 */
export function ProofRequirements({ data, compact = false }: { data: ProofRequirementsData; compact?: boolean }) {
  const rows = [
    { n: 1, label: 'Your name', short: 'Name', value: data.name ?? 'Your full name' },
    { n: 2, label: 'Medicine', short: 'Medicine', value: data.medicine ?? 'The medicine you used' },
    { n: 3, label: 'Dose', short: 'Dose', value: data.dose ?? 'The dose you were on' },
    { n: 4, label: 'Date', short: 'Date', value: `On or after ${formatDate(data.notBefore)}` },
  ];

  if (compact) {
    return (
      <View style={styles.compact}>
        <Text style={styles.compactTitle}>Your proof needs to show</Text>
        {rows.map((r) => (
          <View key={r.n} style={styles.compactRow}>
            <View style={styles.badgeSmall}>
              <Text style={styles.badgeSmallText}>{r.n}</Text>
            </View>
            <Text style={styles.compactLabel}>{r.short}</Text>
            <Text style={styles.compactValue} numberOfLines={1}>
              {r.value}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>YOUR PROOF NEEDS TO SHOW</Text>
      {rows.map((r, i) => (
        <View key={r.n} style={[styles.row, i > 0 && styles.divider]}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{r.n}</Text>
          </View>
          <Text style={styles.label}>{r.label}</Text>
          <Text style={styles.value}>{r.value}</Text>
        </View>
      ))}
      <Text style={styles.note}>All four on one document — for example the pharmacy label on your box or pen.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 20, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.brand100 },
  cardTitle: { fontSize: 11, fontWeight: '700', color: colors.brand800, letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  divider: { borderTopWidth: 1, borderTopColor: colors.slate100 },
  badge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  label: { width: 76, fontSize: 14, color: colors.slate500 },
  value: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.slate900 },
  note: { fontSize: 12, color: colors.slate500, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4 },
  compact: { marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.brand100, backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  compactTitle: { fontSize: 12, fontWeight: '700', color: colors.brand800, marginBottom: 2 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactLabel: { width: 64, fontSize: 12, color: colors.slate500 },
  badgeSmall: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center' },
  badgeSmallText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  compactValue: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.slate900 },
});
