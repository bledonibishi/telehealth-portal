import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Dose, visualStatus } from '../../lib/doses';
import { STATUS_COLOR } from './DoseSheet';
import { colors } from '../../theme';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** A month grid with a coloured dot on each dose day. Tap a day with a dose to open it. */
export function DoseCalendar({ doses, onOpen }: { doses: Dose[]; onOpen: (d: Dose) => void }) {
  const [offset, setOffset] = useState(0);
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const byDay = useMemo(() => {
    const m = new Map<string, Dose[]>();
    for (const d of doses) {
      const k = key(new Date(d.scheduledFor));
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return m;
  }, [doses]);

  const lead = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))];
  while (cells.length % 7) cells.push(null);

  return (
    <View>
      <View style={styles.nav}>
        <Pressable onPress={() => setOffset(offset - 1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10}><Text style={styles.arrow}>‹</Text></Pressable>
        <Text style={styles.month} accessibilityRole="header">{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
        <Pressable onPress={() => setOffset(offset + 1)} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10}><Text style={styles.arrow}>›</Text></Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w) => <Text key={w} style={styles.weekday}>{w}</Text>)}
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={styles.cell} />;
          const list = byDay.get(key(d)) ?? [];
          const dose = list[0];
          const isToday = key(d) === key(today);
          const c = dose ? STATUS_COLOR[visualStatus(dose)] : null;
          return (
            <Pressable key={i} style={styles.cell} disabled={!dose} onPress={() => dose && onOpen(dose)} accessibilityRole={dose ? 'button' : undefined}
              accessibilityLabel={dose ? `${d.getDate()} ${first.toLocaleDateString('en-GB', { month: 'long' })}, ${c!.label} dose` : undefined}>
              <View style={[styles.day, isToday && styles.today, c && { backgroundColor: c.bg }]}>
                <Text style={[styles.dayText, isToday && { fontWeight: '800', color: colors.ink700 }, c && { color: c.text, fontWeight: '700' }]}>{d.getDate()}</Text>
                {c && <View style={[styles.dot, { backgroundColor: c.solid }]} />}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend}>
        {Object.entries(STATUS_COLOR).map(([k, v]) => (
          <View key={k} style={styles.legendItem}><View style={[styles.dot, { backgroundColor: v.solid }]} /><Text style={styles.legendText}>{v.label}</Text></View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  arrow: { fontSize: 28, color: colors.ink600, paddingHorizontal: 10, lineHeight: 30 },
  month: { fontSize: 15, fontWeight: '700', color: colors.ink900 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, color: colors.slate400, marginBottom: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  day: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
  today: { borderWidth: 1.5, borderColor: colors.ink600 },
  dayText: { fontSize: 13, color: colors.slate600 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 11, color: colors.slate500 },
});
