import React, { useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { DETAIL_INFO, DetailChip, DetailInfo, Field, FIELDS, usePulse, useSpotlight } from './DetailChip';

// Mirrors web/src/components/onboarding/ProofSample.tsx: a drawn example of a prescription,
// pharmacy record or order confirmation (made-up details) with the four details outlined.

function Mark({
  field,
  flagged,
  focused,
  pulse,
  children,
}: {
  field: Field;
  flagged: Field[];
  focused: boolean;
  pulse: Animated.Value;
  children: string;
}) {
  const warn = flagged.includes(field);
  const n = FIELDS.find((f) => f.key === field)!.n;
  return (
    <Animated.View
      style={[
        styles.mark,
        focused && styles.markFocused,
        {
          borderColor: warn ? colors.amber400 : colors.brand500,
          borderWidth: focused ? 2.5 : 1.5,
          backgroundColor: warn ? colors.amber100 : colors.brand50,
          shadowColor: warn ? colors.amber400 : colors.brand500,
          opacity: focused ? 1 : 0.7,
          // The spotlit detail breathes; the others stay still.
          transform: [{ scale: focused ? pulse : 1 }],
        },
      ]}
    >
      <Text style={styles.markText}>{children}</Text>
      <View style={[styles.markBadge, { backgroundColor: warn ? colors.amber500 : colors.brand600 }]}>
        <Text style={styles.markBadgeText}>{n}</Text>
      </View>
    </Animated.View>
  );
}

const Row = ({ children, style }: { children: React.ReactNode; style?: object }) => <View style={[styles.row, style]}>{children}</View>;
const T = ({ children, muted, bold }: { children: React.ReactNode; muted?: boolean; bold?: boolean }) => (
  <Text style={[styles.text, muted && { color: colors.slate400 }, bold && { fontWeight: '700', color: colors.slate900 }]}>{children}</Text>
);

export function ProofSample({ type, flagged = [] }: { type: string; flagged?: Field[] }) {
  const [openField, setOpenField] = useState<Field | null>(null);
  const [lastField, setLastField] = useState<Field | null>(null);
  // The outlines take turns: each detail in order grows and pulses for a moment.
  const focusedKey = useSpotlight(
    FIELDS.map((f) => f.key),
    openField,
    type,
  );
  const pulse = usePulse(1.1);
  const M = (field: Field, text: string) => (
    <Mark field={field} flagged={flagged} focused={focusedKey === field} pulse={pulse}>
      {text}
    </Mark>
  );
  const last = FIELDS.find((f) => f.key === lastField);

  return (
    <View style={styles.card}>
      <Text style={styles.caption}>Example — what we need to see</Text>

      <View style={styles.paperWrap}>
        {type === 'PRESCRIPTION_DOCUMENT' ? (
          <View style={styles.paper}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T muted>PRESCRIPTION</T>
              <T muted>Example Medical Practice</T>
            </Row>
            <Row>
              <T>Patient: </T>
              {M('NAME', 'Jane Example')}
            </Row>
            <Row>
              <T>Date issued: </T>
              {M('DATE', '12/09/2026')}
            </Row>
            <Row>
              {M('MEDICINE', 'Mounjaro')}
              <T> </T>
              {M('DOSE', '5 mg')}
              <T> KwikPen</T>
            </Row>
            <T muted>Inject once weekly as directed. 1 pen (4 doses)</T>
          </View>
        ) : type === 'PHARMACY_RECORD' ? (
          <View style={styles.paper}>
            <T muted>MEDICATION HISTORY</T>
            <Row>
              <T>Patient: </T>
              {M('NAME', 'Jane Example')}
            </Row>
            <Row style={styles.tableRow}>
              {M('DATE', '12/09/26')}
              {M('MEDICINE', 'Mounjaro')}
              {M('DOSE', '5 mg')}
            </Row>
            <Row style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: colors.slate100 }]}>
              <T muted>14/08/26</T>
              <T muted>Mounjaro</T>
              <T muted>2.5 mg</T>
            </Row>
            <T muted>The most recent entry is the one we use.</T>
          </View>
        ) : type === 'ORDER_CONFIRMATION' ? (
          <View style={styles.paper}>
            <T bold>Your order is confirmed</T>
            <Row>
              <T>Hi </T>
              {M('NAME', 'Jane Example')}
              <T>,</T>
            </Row>
            <Row>
              <T>Order date: </T>
              {M('DATE', '12/09/2026')}
            </Row>
            <Row style={{ borderTopWidth: 1, borderTopColor: colors.slate100, paddingTop: 8 }}>
              {M('MEDICINE', 'Mounjaro')}
              <T> </T>
              {M('DOSE', '5 mg')}
              <T> KwikPen × 1</T>
            </Row>
          </View>
        ) : (
          <View style={[styles.paper, styles.label]}>
            <Row>
              {M('MEDICINE', 'MOUNJARO')}
              <T> </T>
              {M('DOSE', '5MG')}
              <T bold>/0.6ML KWIKPEN</T>
            </Row>
            <T muted>INJECT ONCE WEEKLY AS DIRECTED</T>
            <Row style={{ justifyContent: 'space-between' }}>
              {M('NAME', 'JANE EXAMPLE')}
              <T muted>QTY: 1</T>
            </Row>
            <Row>
              <T>DISPENSED: </T>
              {M('DATE', '12/09/2026')}
            </Row>
          </View>
        )}
      </View>

      <View style={styles.chips}>
        {FIELDS.map((f) => (
          <DetailChip
            key={f.key}
            n={f.n}
            label={f.label}
            state={flagged.includes(f.key) ? 'flagged' : 'shown'}
            open={openField === f.key}
            highlighted={focusedKey === f.key}
            onToggle={() => {
              setLastField(f.key);
              setOpenField((current) => (current === f.key ? null : f.key));
            }}
          />
        ))}
      </View>
      <DetailInfo
        idle="Tap a number to see what each one means."
        open={openField !== null}
        info={
          last ? (
            <Text>
              <Text style={{ fontWeight: '700' }}>
                {last.n} {last.label}
              </Text>
              {' — '}
              {DETAIL_INFO[last.key]}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.white, padding: 12 },
  caption: { fontSize: 12, fontWeight: '600', color: colors.slate500 },
  paperWrap: { marginTop: 8, borderRadius: 12, backgroundColor: colors.slate50, padding: 10 },
  paper: { backgroundColor: colors.white, borderRadius: 8, borderWidth: 1, borderColor: colors.slate200, padding: 12, gap: 10 },
  label: { borderStyle: 'dashed', borderWidth: 2, borderColor: colors.slate300 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 8 },
  tableRow: { justifyContent: 'space-between', paddingVertical: 4 },
  text: { fontSize: 12, color: colors.slate700 },
  mark: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  markFocused: { zIndex: 10, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  markText: { fontSize: 12, color: colors.slate800, fontWeight: '500' },
  markBadge: { position: 'absolute', top: -9, right: -9, width: 15, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  markBadgeText: { color: colors.white, fontSize: 9, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 },
});
