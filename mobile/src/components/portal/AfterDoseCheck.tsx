import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@apollo/client';
import { LOG_DOSE_FEELING } from '../../graphql/portal';
import { FEELINGS } from '../../lib/weight';
import { takenAtText } from '../../lib/format';
import { Button, Card, ErrorText } from '../ui';
import { ReportSideEffectSheet } from './ReportSideEffect';
import { colors } from '../../theme';

/** "How are you feeling after your injection?": the answer goes to the doctor with the dose it belongs to. */
export function AfterDoseCheck({ dose, doseName }: { dose: { id: string; takenAt: string }; doseName: string }) {
  const [answered, setAnswered] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [save, { loading, error }] = useMutation(LOG_DOSE_FEELING, { refetchQueries: ['MyDoseCalendar'] });
  const rough = answered === 'DIFFICULTIES' || answered === 'NOT_WELL';

  const answer = async (feeling: string) => {
    try {
      await save({ variables: { id: dose.id, feeling } });
      setAnswered(feeling);
    } catch { /* shown from `error` */ }
  };

  return (
    <Card style={{ marginBottom: 14 }}>
      {answered ? (
        <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
          <Text style={styles.title}>Thanks. Your doctor can see this.</Text>
          {rough && (
            <>
              <Text style={styles.small}>Sorry you’re not feeling great. Tell your doctor what you’re feeling so they can help.</Text>
              <Button variant="link" label="Report a side effect →" onPress={() => setReporting(true)} />
            </>
          )}
        </View>
      ) : (
        <>
          <Text style={styles.title}>How are you feeling after your injection?</Text>
          <Text style={styles.small}>{doseName}, taken {takenAtText(dose.takenAt)}. It helps your doctor decide on your next dose.</Text>
          <View style={styles.chips}>
            {FEELINGS.map((f) => (
              <Pressable key={f.value} disabled={loading} onPress={() => answer(f.value)} accessibilityRole="button" style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }, loading && { opacity: 0.5 }]}>
                <Text style={styles.chipText}>{f.emoji} {f.label}</Text>
              </Pressable>
            ))}
          </View>
          <ErrorText>{error?.message}</ErrorText>
        </>
      )}
      <ReportSideEffectSheet visible={reporting} onClose={() => setReporting(false)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: colors.slate900 },
  small: { fontSize: 12, color: colors.slate500, lineHeight: 17, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: colors.slate200, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.white },
  chipText: { fontSize: 13, color: colors.slate700 },
});
