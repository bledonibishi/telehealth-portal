import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation } from '@apollo/client';
import { REPORT_SIDE_EFFECTS } from '../../graphql/portal';
import { EFFECTS, SEVERITIES } from '../../lib/sideEffects';
import { EMERGENCY_NUMBER } from '../../lib/config';
import { BottomSheet } from '../BottomSheet';
import { Button, ErrorText } from '../ui';
import { colors } from '../../theme';

function Form({ onClose }: { onClose: () => void }) {
  const [effects, setEffects] = useState<string[]>([]);
  const [severity, setSeverity] = useState('MILD');
  const [note, setNote] = useState('');
  const [send, { data, loading, error }] = useMutation(REPORT_SIDE_EFFECTS, { refetchQueries: ['MySideEffectReports'] });
  const sent = data?.reportSideEffects;
  const toggle = (k: string) => setEffects((e) => (e.includes(k) ? e.filter((x) => x !== k) : [...e, k]));

  if (sent) {
    return (
      <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
        <Text style={styles.sentTitle}>✓ Your doctor has been told</Text>
        <Text style={styles.small}>They’ll look at it and message you if they need to. This doesn’t replace urgent care.</Text>
        {!!sent.advice && <Text style={styles.urgent}>{sent.advice}</Text>}
        <Button label="Close" variant="soft" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <View>
        <Text style={styles.legend}>What are you feeling?</Text>
        <View style={styles.chips}>
          {EFFECTS.map(([key, label]) => {
            const on = effects.includes(key);
            return (
              <Pressable key={key} onPress={() => toggle(key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View>
        <Text style={styles.legend}>How much is it affecting you?</Text>
        <View style={{ gap: 8 }}>
          {SEVERITIES.map(([key, label, hint]) => (
            <Pressable key={key} onPress={() => setSeverity(key)} accessibilityRole="radio" accessibilityState={{ selected: severity === key }} style={[styles.sev, severity === key && styles.sevOn]}>
              <Text style={styles.sevLabel}>{label}</Text>
              <Text style={styles.small}>{hint}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {effects.includes('allergic_reaction') && <Text style={styles.urgent}>Swelling of your face, lips or throat, or trouble breathing, is an emergency: call {EMERGENCY_NUMBER} now. Don’t take another dose until a doctor has told you to.</Text>}
      {severity === 'SEVERE' && <Text style={styles.urgent}>If you have severe stomach pain, can’t keep fluids down, or feel very unwell, call {EMERGENCY_NUMBER} or go to your nearest emergency department now. Don’t wait for a reply.</Text>}
      <TextInput value={note} onChangeText={setNote} placeholder="Anything else? (optional)" placeholderTextColor={colors.slate400} multiline maxLength={500} style={styles.note} />
      <ErrorText error={error} />
      <Button label="Tell my doctor" disabled={!effects.length} loading={loading} onPress={() => send({ variables: { input: { effects, severity, note: note.trim() || undefined } } }).catch(() => undefined)} />
    </View>
  );
}

/** Tell the doctor about a side effect, from anywhere in the app. */
export function ReportSideEffectSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Report a side effect">
      <Form onClose={onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  legend: { fontSize: 12, fontWeight: '700', color: colors.slate500, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.slate200, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.ink50, borderColor: colors.ink600 },
  chipText: { fontSize: 14, color: colors.slate600 },
  chipTextOn: { color: colors.ink800, fontWeight: '700' },
  sev: { borderWidth: 1, borderColor: colors.slate200, borderRadius: 14, padding: 12 },
  sevOn: { borderColor: colors.ink600, backgroundColor: colors.ink50 },
  sevLabel: { fontSize: 15, fontWeight: '700', color: colors.slate900 },
  small: { fontSize: 12, color: colors.slate500, lineHeight: 17 },
  urgent: { fontSize: 13, color: colors.red800, backgroundColor: colors.red50, borderWidth: 1, borderColor: colors.red100, borderRadius: 12, padding: 12, lineHeight: 19 },
  note: { borderWidth: 1, borderColor: colors.slate200, borderRadius: 12, padding: 12, minHeight: 64, fontSize: 15, color: colors.slate900, textAlignVertical: 'top' },
  sentTitle: { fontSize: 16, fontWeight: '700', color: colors.slate900 },
});
