import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@apollo/client';
import { MY_WEIGHT_JOURNEY, SET_MY_TARGET_WEIGHT } from '../../graphql/portal';
import { fmtDate, kg } from '../../lib/format';
import { targetPlan } from '../../lib/weight';
import { Button, ErrorText, Field, ProgressBar } from '../ui';
import { colors } from '../../theme';

/** What the typed target means: how much to lose, a steady-pace date range and where they stand on the way. */
function Preview({ currentKg, startKg, targetKg }: { currentKg: number; startKg?: number | null; targetKg: number }) {
  const plan = targetPlan(currentKg, targetKg, startKg, new Date());
  if (plan.kind === 'AT_OR_ABOVE') return <Text style={styles.note}>That is at or above your current weight ({kg(currentKg)}). Choose a lower number if you want to lose weight.</Text>;
  const month = (d: Date) => fmtDate(d, { month: 'short', year: 'numeric' });
  const from = month(plan.fastestAt);
  const to = month(plan.slowestAt);
  return (
    <View style={styles.preview} accessibilityLiveRegion="polite">
      <Text style={styles.previewTitle}>You’d lose {kg(plan.toLoseKg)} to reach {kg(targetKg)}.</Text>
      <Text style={styles.note}>At a steady 0.5–1 kg a week that’s around {from === to ? from : `${from} – ${to}`}. A rough guide, not a promise: your doctor sets your plan.</Text>
      {plan.percent !== null && startKg != null && (
        <View style={{ marginTop: 8 }}>
          <ProgressBar percent={plan.percent} label={`From ${kg(startKg)} to ${kg(targetKg)}`} />
          <View style={styles.ends}><Text style={styles.endText}>{kg(startKg)}</Text><Text style={styles.endText}>🎯 {kg(targetKg)}</Text></View>
        </View>
      )}
    </View>
  );
}

export function TargetWeightForm({ current, currentKg, startKg, onDone }: { current?: number | null; currentKg?: number | null; startKg?: number | null; onDone?: () => void }) {
  const [value, setValue] = useState(current ? String(current) : '');
  const [save, { loading, error }] = useMutation(SET_MY_TARGET_WEIGHT, { refetchQueries: [{ query: MY_WEIGHT_JOURNEY }], awaitRefetchQueries: true });
  const n = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && Number.isFinite(n) && n > 0;

  const submit = async () => {
    if (!valid) return;
    try {
      await save({ variables: { targetWeightKg: n } });
      onDone?.();
    } catch { /* shown from `error` */ }
  };

  return (
    <View style={{ gap: 10 }}>
      <Field label="What’s your target weight? (kg)" keyboardType="decimal-pad" value={value} onChangeText={setValue} />
      {valid && currentKg != null && <Preview currentKg={currentKg} startKg={startKg} targetKg={n} />}
      <ErrorText>{error?.message}</ErrorText>
      <Button label="Save target" onPress={submit} disabled={!valid} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { backgroundColor: colors.slate50, borderRadius: 14, borderWidth: 1, borderColor: colors.slate100, padding: 12, gap: 4 },
  previewTitle: { fontSize: 14, fontWeight: '700', color: colors.slate900 },
  note: { fontSize: 12, color: colors.slate500, lineHeight: 17 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  endText: { fontSize: 11, color: colors.slate400 },
});
