import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Dose, isRotatingPen } from '../../lib/doses';
import { fmtDate, fmtTime } from '../../lib/format';
import { SITE_LABEL, type InjectionSite } from '../../lib/injectionSites';
import { feelingOf } from '../../lib/weight';
import { Card, CardTitle } from '../ui';
import { colors } from '../../theme';

/** What was taken, when, where it went in and how the patient felt. Newest first. */
export function DoseHistory({ doses }: { doses: Dose[] }) {
  const taken = doses.filter((d) => d.status === 'TAKEN' && d.takenAt).sort((a, b) => b.takenAt!.localeCompare(a.takenAt!)).slice(0, 12);
  if (taken.length === 0) return null;
  return (
    <Card>
      <CardTitle title="Dose history" />
      {taken.map((d, i) => {
        const feeling = feelingOf(d.feelingAfter);
        return (
          <View key={d.id} style={[styles.row, i > 0 && styles.rowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.date}>{fmtDate(d.takenAt!)} · {fmtTime(d.takenAt!)}</Text>
              <Text style={styles.dose}>{d.strength.label}{isRotatingPen(d) && d.injectionSite ? ` · ${SITE_LABEL[d.injectionSite as InjectionSite]}` : ''}</Text>
            </View>
            <Text style={styles.feeling}>{feeling ? `${feeling.emoji} ${feeling.label}` : '—'}</Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.slate100 },
  date: { fontSize: 13, fontWeight: '600', color: colors.slate800 },
  dose: { fontSize: 12, color: colors.slate500, marginTop: 1 },
  feeling: { fontSize: 12, color: colors.slate500, maxWidth: 150, textAlign: 'right' },
});
