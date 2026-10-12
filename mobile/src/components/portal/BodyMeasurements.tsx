import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { ADD_MY_BODY_MEASUREMENT, MY_BODY_MEASUREMENTS, VOID_MY_BODY_MEASUREMENT } from '../../graphql/portal';
import { cmChange, MEASURES, summariseMeasurements, type BodyMeasurement } from '../../lib/bodyMeasurements';
import { fmtDate } from '../../lib/format';
import { BottomSheet } from '../BottomSheet';
import { Button, Card, CardTitle, Empty, ErrorText, Field, Stat } from '../ui';
import { colors } from '../../theme';
import { errorMessage } from '@telehealth/shared-types';

const requestId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function MeasurementForm({ onDone }: { onDone: () => void }) {
  const [values, setValues] = useState({ waistCm: '', hipsCm: '', armCm: '' });
  const [problem, setProblem] = useState<unknown>(null);
  const id = useRef(requestId());
  const [save, { loading }] = useMutation(ADD_MY_BODY_MEASUREMENT, {
    update: (cache, { data }) => cache.writeQuery({ query: MY_BODY_MEASUREMENTS, data: { myBodyMeasurements: data.addMyBodyMeasurement } }),
  });

  const submit = async () => {
    const input: Record<string, number | string> = { clientRequestId: id.current };
    for (const m of MEASURES) {
      const raw = values[m.key].trim().replace(',', '.');
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < m.min || n > m.max) return setProblem(`Please enter a ${m.label.toLowerCase()} between ${m.min} and ${m.max} cm.`);
      input[m.key] = n;
    }
    if (Object.keys(input).length === 1) return setProblem('Enter at least one measurement.');
    setProblem(null);
    try {
      await save({ variables: { input } });
      onDone();
    } catch (e: any) {
      setProblem(e);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {MEASURES.map((m) => (
        <Field key={m.key} label={`${m.label} (cm)`} hint={m.hint} keyboardType="decimal-pad" value={values[m.key]} onChangeText={(t) => setValues({ ...values, [m.key]: t })} />
      ))}
      <Text style={styles.tip}>Measure at the same time of day each time, on bare skin, without pulling the tape tight.</Text>
      <ErrorText error={problem} />
      <Button label="Save measurements" onPress={submit} loading={loading} />
    </View>
  );
}

/** Waist, hips and arm over time: fat loss the scale alone doesn't show. */
export function BodyMeasurementsCard() {
  const { data, loading, error } = useQuery(MY_BODY_MEASUREMENTS, { fetchPolicy: 'cache-and-network' });
  const [adding, setAdding] = useState(false);
  const [remove] = useMutation(VOID_MY_BODY_MEASUREMENT, {
    update: (cache, { data }) => cache.writeQuery({ query: MY_BODY_MEASUREMENTS, data: { myBodyMeasurements: data.voidMyBodyMeasurement } }),
  });
  const list: BodyMeasurement[] = data?.myBodyMeasurements ?? [];
  const summary = summariseMeasurements(list);

  const confirmRemove = (m: BodyMeasurement) =>
    Alert.alert('Remove this entry?', `The measurements from ${fmtDate(m.measuredAt)} will be hidden.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove({ variables: { id: m.id } }).catch((e) => Alert.alert('Couldn’t remove it', errorMessage(e))) },
    ]);

  return (
    <Card>
      <CardTitle title="Body measurements" subtitle="Waist, hips and arm: progress the scale doesn’t show." right={<Button small variant="soft" label="+ Add" onPress={() => setAdding(true)} />} />
      {loading && !data && <Empty>Loading…</Empty>}
      {!data && <ErrorText error={error} />}
      {data && list.length === 0 && <Empty>Take your waist, hips and arm measurements to see the inches come off, even when the scale moves slowly.</Empty>}

      {summary.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {MEASURES.map((m) => {
              const s = summary.find((x) => x.key === m.key);
              return (
                <View key={m.key} style={{ flex: 1 }}>
                  <Stat label={m.label} value={s ? `${s.latestCm} cm` : '—'} />
                  {s && s.changeCm !== null && <Text style={[styles.change, s.changeCm < 0 && { color: colors.emerald700 }]}>{cmChange(s.changeCm)} since you started</Text>}
                </View>
              );
            })}
          </View>
          <View style={{ marginTop: 14 }}>
            <Text style={styles.historyTitle}>History</Text>
            {list.slice(0, 6).map((m) => (
              <View key={m.id} style={styles.historyRow}>
                <Text style={styles.historyDate}>{fmtDate(m.measuredAt)}</Text>
                <Text style={styles.historyValues}>{MEASURES.filter((x) => m[x.key] !== null).map((x) => `${x.label} ${m[x.key]}`).join(' · ')} cm</Text>
                <Text style={styles.remove} onPress={() => confirmRemove(m)} accessibilityRole="button" accessibilityLabel={`Remove the entry from ${fmtDate(m.measuredAt)}`}>Remove</Text>
              </View>
            ))}
          </View>
        </>
      )}
      <BottomSheet visible={adding} onClose={() => setAdding(false)} title="Add your measurements">
        <MeasurementForm onDone={() => setAdding(false)} />
      </BottomSheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  tip: { fontSize: 12, color: colors.slate400, lineHeight: 17 },
  change: { fontSize: 11, color: colors.slate500, marginTop: 2 },
  historyTitle: { fontSize: 12, fontWeight: '700', color: colors.slate500, marginBottom: 4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.slate100 },
  historyDate: { width: 92, fontSize: 12, color: colors.slate500 },
  historyValues: { flex: 1, fontSize: 12, color: colors.slate700 },
  remove: { fontSize: 12, color: colors.slate400, padding: 4 },
});
