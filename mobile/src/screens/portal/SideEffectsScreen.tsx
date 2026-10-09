import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { LOG_MY_SIDE_EFFECT_SCORES, MY_PRODUCT_KIND, MY_SIDE_EFFECT_REPORTS, MY_SIDE_EFFECT_SCORES } from '../../graphql/portal';
import { BottomSheet } from '../../components/BottomSheet';
import { ReportSideEffectSheet } from '../../components/portal/ReportSideEffect';
import { Button, Card, CardTitle, Columns, Empty, ErrorText, Pill, Screen } from '../../components/ui';
import { describeScore, HIGH_SCORE, isScoreCheckDue, SCORES, type ScoreEntry, type ScoreKey } from '../../lib/sideEffectScores';
import { EFFECT_LABEL } from '../../lib/sideEffects';
import { fmtDate } from '../../lib/format';
import { EMERGENCY_NUMBER } from '../../lib/config';
import { colors } from '../../theme';

const blank = (): Record<ScoreKey, number> => ({ nausea: 1, vomiting: 1, abdominalPain: 1, diarrhoea: 1, constipation: 1, fatigue: 1 });
const requestId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** 1 to 10 as ten tappable numbers: easier to hit than a slider, and read out clearly by a screen reader. */
function ScoreScale({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.scaleHead}>
        <Text style={styles.scaleLabel}>{label}</Text>
        <Text style={[styles.scaleValue, value >= HIGH_SCORE && { color: colors.danger }]}>{value} <Text style={styles.scaleWord}>· {describeScore(value)}</Text></Text>
      </View>
      <View style={styles.scale} accessibilityRole="radiogroup">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio" accessibilityLabel={`${label} ${n} out of 10`} accessibilityState={{ selected: value === n }}
            style={[styles.step, n <= value && styles.stepOn, n <= value && n >= HIGH_SCORE && styles.stepHot]}>
            <Text style={[styles.stepText, n <= value && { color: colors.white }]}>{n}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ScoresForm({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState(blank);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<unknown>(null);
  const id = useRef(requestId());
  const [save, { data, loading }] = useMutation(LOG_MY_SIDE_EFFECT_SCORES, { refetchQueries: [{ query: MY_SIDE_EFFECT_SCORES }, { query: MY_SIDE_EFFECT_REPORTS }] });
  const saved = data?.logMySideEffectScores;

  const submit = async () => {
    setProblem(null);
    try {
      await save({ variables: { input: { ...values, note: note.trim() || undefined, clientRequestId: id.current } } });
    } catch (e: any) {
      setProblem(e);
    }
  };

  if (saved) {
    const high = SCORES.filter((s) => saved[s.key] >= HIGH_SCORE);
    return (
      <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
        <Text style={styles.savedTitle}>✓ Saved. Your doctor can see this</Text>
        <Text style={styles.small}>They look at your scores before they approve your next dose or supply.</Text>
        {high.length > 0 && <Text style={styles.small}>You marked {high.map((s) => s.label.toLowerCase()).join(' and ')} as strong, so your doctor has been alerted as well.</Text>}
        {!!saved.advice && <Text style={styles.urgent}>{saved.advice}</Text>}
        <Button variant="soft" label="Close" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Text style={styles.small}>Over the last week, how strong was each of these? <Text style={{ fontWeight: '700', color: colors.slate700 }}>1 means none, 10 means the worst you can imagine.</Text></Text>
      {SCORES.map((s) => <ScoreScale key={s.key} label={s.label} value={values[s.key]} onChange={(n) => setValues({ ...values, [s.key]: n })} />)}
      <TextInput value={note} onChangeText={setNote} placeholder="Anything else? (optional)" placeholderTextColor={colors.slate400} multiline maxLength={500} style={styles.note} />
      <ErrorText error={problem} />
      <Button label="Save this week" loading={loading} onPress={submit} />
      <Text style={styles.tiny}>This isn’t for emergencies. For severe stomach pain, trouble breathing or swelling of the face or throat, call {EMERGENCY_NUMBER}.</Text>
    </View>
  );
}

const SEVERITY_TONE: Record<string, 'plain' | 'warn' | 'danger'> = { MILD: 'plain', MODERATE: 'warn', SEVERE: 'danger' };

/** The weekly side-effect scores and what the patient has reported. Both go to the doctor before they approve the next dose. */
export function SideEffectsScreen() {
  const { data: kind } = useQuery(MY_PRODUCT_KIND, { fetchPolicy: 'cache-first' });
  const glp1 = kind?.myProductKind === 'GLP1';
  const { data, refetch, loading } = useQuery(MY_SIDE_EFFECT_SCORES, { fetchPolicy: 'cache-and-network', skip: !glp1 });
  const { data: reportData, refetch: refetchReports } = useQuery(MY_SIDE_EFFECT_REPORTS, { fetchPolicy: 'cache-and-network' });
  const [logging, setLogging] = useState(false);
  const [reporting, setReporting] = useState(false);
  const entries: ScoreEntry[] = data?.mySideEffectScores ?? [];
  const reports: any[] = reportData?.mySideEffectReports ?? [];
  const latest = entries[0];
  const previous = entries[1];
  const due = data ? isScoreCheckDue(entries) : false;

  return (
    <Screen title="Side effects" subtitle="What you tell us goes straight to your doctor." refreshing={loading} onRefresh={() => { refetch?.(); refetchReports(); }}>
      <Columns>
        {glp1 && (
          <Card>
            <CardTitle title="Weekly check" subtitle="Score how you feel each week. Your doctor reads it before approving your next dose." />
            {data && !latest && <Empty>You haven’t logged yet. It takes a minute, and it helps your doctor choose the right dose for you.</Empty>}
            {latest && (
              <View style={{ gap: 6, marginBottom: 12 }}>
                <Text style={styles.small}>Last logged {fmtDate(latest.recordedAt)}{due ? ' · time for this week’s' : ''}</Text>
                {SCORES.map((s) => {
                  const now = latest[s.key];
                  const was = previous?.[s.key];
                  return (
                    <View key={s.key} style={styles.scoreRow}>
                      <Text style={styles.scoreName}>{s.label}</Text>
                      <Text style={[styles.scoreNow, now >= HIGH_SCORE && { color: colors.danger }]}>
                        {now}/10
                        {was !== undefined && was !== now && <Text style={[styles.delta, { color: now < was ? colors.emerald700 : colors.amber700 }]}>  {now < was ? '↓' : '↑'} from {was}</Text>}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            <Button label={due || !latest ? 'Log this week' : 'Log again'} variant={due || !latest ? 'primary' : 'soft'} onPress={() => setLogging(true)} />
          </Card>
        )}

        <Card>
          <CardTitle title="Reported side effects" subtitle="Something doesn’t feel right? You don’t need to wait for your check-in." right={<Button small variant="soft" label="Report one" onPress={() => setReporting(true)} />} />
          {reports.length === 0 ? <Empty>Nothing reported.</Empty> : reports.slice(0, 6).map((r, i) => (
            <View key={r.id} style={[styles.reportRow, i > 0 && styles.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reportName}>{r.effects.map((e: string) => EFFECT_LABEL[e] ?? e).join(', ')}</Text>
                {!!r.note && <Text style={styles.small} numberOfLines={2}>{r.note}</Text>}
                <Text style={styles.tiny}>{fmtDate(r.createdAt)} · {r.acknowledgedAt ? 'Seen by your doctor' : 'Sent to your doctor'}</Text>
              </View>
              <Pill label={r.severity.charAt(0) + r.severity.slice(1).toLowerCase()} tone={SEVERITY_TONE[r.severity]} />
            </View>
          ))}
        </Card>
      </Columns>

      <BottomSheet visible={logging} onClose={() => setLogging(false)} title="How have you been this week?">
        {logging && <ScoresForm onClose={() => setLogging(false)} />}
      </BottomSheet>
      <ReportSideEffectSheet visible={reporting} onClose={() => setReporting(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scaleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  scaleLabel: { fontSize: 14, fontWeight: '700', color: colors.slate900 },
  scaleValue: { fontSize: 14, fontWeight: '800', color: colors.slate700 },
  scaleWord: { fontSize: 12, fontWeight: '400', color: colors.slate400 },
  scale: { flexDirection: 'row', gap: 4 },
  step: { flex: 1, minHeight: 38, borderRadius: 9, backgroundColor: colors.slate100, alignItems: 'center', justifyContent: 'center' },
  stepOn: { backgroundColor: colors.ink600 },
  stepHot: { backgroundColor: colors.danger },
  stepText: { fontSize: 12, fontWeight: '700', color: colors.slate500 },
  small: { fontSize: 12, color: colors.slate500, lineHeight: 17 },
  tiny: { fontSize: 11, color: colors.slate400, lineHeight: 15, marginTop: 2 },
  note: { borderWidth: 1, borderColor: colors.slate200, borderRadius: 12, padding: 12, minHeight: 64, fontSize: 15, color: colors.slate900, textAlignVertical: 'top' },
  savedTitle: { fontSize: 16, fontWeight: '700', color: colors.slate900 },
  urgent: { fontSize: 13, color: colors.red800, backgroundColor: colors.red50, borderWidth: 1, borderColor: colors.red100, borderRadius: 12, padding: 12, lineHeight: 19 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreName: { fontSize: 14, color: colors.slate600 },
  scoreNow: { fontSize: 14, fontWeight: '700', color: colors.slate800 },
  delta: { fontSize: 12, fontWeight: '600' },
  reportRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.slate100 },
  reportName: { fontSize: 14, fontWeight: '600', color: colors.slate800 },
});
