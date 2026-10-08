import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { MY_WEIGHT_JOURNEY, MY_WEIGHT_TIMELINE, MY_WEIGHT_TREND } from '../../graphql/portal';
import { MY_CONSULTATIONS } from '../../graphql/operations';
import { trendMessage } from '../../lib/weightTrend';
import { BottomSheet } from '../../components/BottomSheet';
import { BodyMeasurementsCard } from '../../components/portal/BodyMeasurements';
import { LogWeightForm } from '../../components/portal/LogWeight';
import { TargetWeightForm } from '../../components/portal/TargetWeight';
import { Button, Card, CardTitle, Columns, Empty, ErrorText, Notice, ProgressBar, Screen, Stat } from '../../components/ui';
import { checkInLine } from '../../lib/weight';
import { fmtDate, kg } from '../../lib/format';
import { openLink } from '../../lib/config';
import { colors } from '../../theme';

const DAY = 86_400_000;
const SPARK_POINTS = 24;

/** The last weigh-ins as bars, tallest for the heaviest: the shape of the trend at a glance. */
function Sparkline({ points }: { points: { weightKg: number; measuredAt: string }[] }) {
  const shown = points.slice(-SPARK_POINTS);
  const min = Math.min(...shown.map((p) => p.weightKg));
  const max = Math.max(...shown.map((p) => p.weightKg));
  const span = Math.max(max - min, 1);
  return (
    <View accessible accessibilityLabel={`Your last ${shown.length} weigh-ins, from ${kg(shown[0].weightKg)} to ${kg(shown[shown.length - 1].weightKg)}`}>
      <View style={styles.sparkRow}>
        {shown.map((p, i) => (
          <View key={`${p.measuredAt}-${i}`} style={[styles.sparkBar, { height: 14 + ((p.weightKg - min) / span) * 56, opacity: i === shown.length - 1 ? 1 : 0.55 }]} />
        ))}
      </View>
      <View style={styles.sparkEnds}>
        <Text style={styles.sparkEnd}>{fmtDate(shown[0].measuredAt, { day: 'numeric', month: 'short' })}</Text>
        <Text style={styles.sparkEnd}>{fmtDate(shown[shown.length - 1].measuredAt, { day: 'numeric', month: 'short' })}</Text>
      </View>
    </View>
  );
}

export function WeightScreen({ navigation }: any) {
  const { data, loading, error, refetch } = useQuery(MY_WEIGHT_JOURNEY, { fetchPolicy: 'cache-and-network' });
  // The window follows the calendar: fixed within a day (so the query is not re-sent on every render) and moved on the next, so a weight logged days after the app opened is still inside it.
  const today = new Date().toDateString();
  const range = useMemo(() => ({ from: new Date(Date.now() - 90 * DAY).toISOString(), to: new Date(Date.now() + DAY).toISOString() }), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: tl } = useQuery(MY_WEIGHT_TIMELINE, { variables: { ...range, limit: 200 }, fetchPolicy: 'cache-and-network' });
  const { data: trendData } = useQuery(MY_WEIGHT_TREND, { fetchPolicy: 'cache-and-network' });
  const { data: consultations } = useQuery(MY_CONSULTATIONS, { fetchPolicy: 'cache-first' });
  const [sheet, setSheet] = useState<'log' | 'target' | null>(null);
  const message = trendData?.myWeightTrend ? trendMessage(trendData.myWeightTrend) : null;
  // Messages are written inside a consultation, so the button is only offered once one is known: without it the screen it opens has nowhere to type.
  const consultationId: string | undefined = consultations?.myConsultations?.[0]?.id;
  const messageDoctor = () => navigation.navigate('Messages', { consultationId });

  const journey = data?.myWeightJourney;
  const points: { weightKg: number; measuredAt: string }[] = tl?.myWeightTimeline?.measurements ?? [];
  const hasProgress = journey?.progressPercentage != null;
  const line = journey ? checkInLine(journey) : null;

  return (
    <Screen title="Weight Journey" subtitle="Your weigh-ins over time." refreshing={loading} onRefresh={() => refetch()}>
      {loading && !journey && <Empty>Loading…</Empty>}
      {error && !journey && <ErrorText>{error.message}</ErrorText>}
      {!loading && !error && !journey && <Card><Empty>The Weight Journey is available on our weight-management programme.</Empty></Card>}

      {journey && (
        <View style={{ gap: 14 }}>
          {message && (
            <Notice tone={message.tone === 'red' ? 'danger' : message.tone === 'orange' ? 'warn' : message.tone === 'green' ? 'good' : 'info'} title={`${message.icon} ${message.title}`}
              action={message.action === 'MESSAGE_DOCTOR' && consultationId ? <Button small variant="soft" label="Message my doctor" onPress={messageDoctor} style={{ alignSelf: 'flex-start', marginTop: 10 }} /> : undefined}>
              {message.text}
            </Notice>
          )}
          <Columns>
            <Card>
              <CardTitle title="Weight journey" right={journey.startingWeightKg ? <Button small variant="soft" label="+ Log weight" onPress={() => setSheet('log')} /> : undefined} />
              <Text style={styles.big}>{kg(journey.currentWeightKg)}</Text>
              <Text style={styles.muted}>{journey.latestMeasurementAt ? `Updated ${fmtDate(journey.latestMeasurementAt, { day: 'numeric', month: 'short' })}` : 'Current weight'}</Text>
              {hasProgress ? (
                <>
                  {!!journey.motivationMessage && <Text style={styles.message}>{journey.motivationMessage}</Text>}
                  <View style={{ marginVertical: 12 }}><ProgressBar percent={journey.progressPercentage} label="Progress to your target" /></View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Stat label="Start" value={kg(journey.startingWeightKg)} />
                    <Stat label="Lost" value={kg(Math.max(journey.weightLostKg, 0))} tone="good" />
                    <Stat label="To go" value={kg(journey.remainingKg)} />
                    <Stat label="Target" value={kg(journey.targetWeightKg)} />
                  </View>
                  <Button variant="link" label="Change target" onPress={() => setSheet('target')} style={{ marginTop: 8 }} />
                </>
              ) : journey.startingWeightKg ? (
                <View style={{ marginTop: 14 }}>
                  <TargetWeightForm currentKg={journey.currentWeightKg} startKg={journey.startingWeightKg} />
                </View>
              ) : (
                <Text style={[styles.muted, { marginTop: 12 }]}>Complete your medical questionnaire and we’ll set up your journey.</Text>
              )}
              {line && (
                line.ready ? (
                  <View style={styles.ready}>
                    <Text style={styles.readyText}>{line.text}</Text>
                    {journey.checkInUrl && <Button small label="Start" onPress={() => openLink(journey.checkInUrl)} />}
                  </View>
                ) : (
                  <Text style={[styles.muted, { marginTop: 12 }]}>{line.text}</Text>
                )
              )}
            </Card>

            <Card>
              <CardTitle title="Your weigh-ins" subtitle="The last 3 months." />
              {points.length === 0 ? (
                <View style={{ gap: 12, alignItems: 'flex-start' }}>
                  <Empty>🎯 Log your first weight to start tracking your progress.</Empty>
                  {journey.startingWeightKg && <Button label="Log your weight now" onPress={() => setSheet('log')} />}
                </View>
              ) : (
                <Sparkline points={points} />
              )}
            </Card>
          </Columns>

          <BodyMeasurementsCard />
          <Text style={styles.disclaimer}>Everyone’s journey is different. This tracker is here to help you see your own progress. It isn’t a promise of any particular result.</Text>
        </View>
      )}

      <BottomSheet visible={sheet === 'log'} onClose={() => setSheet(null)} title="Log your weight">
        <LogWeightForm onSaved={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet visible={sheet === 'target'} onClose={() => setSheet(null)} title="Change your target weight">
        {journey && <TargetWeightForm current={journey.targetWeightKg} currentKg={journey.currentWeightKg} startKg={journey.startingWeightKg} onDone={() => setSheet(null)} />}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 34, fontWeight: '800', color: colors.ink900 },
  muted: { fontSize: 12, color: colors.slate500, lineHeight: 17 },
  message: { fontSize: 13, color: colors.slate600, marginTop: 8, lineHeight: 19 },
  ready: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, backgroundColor: colors.ink50, borderRadius: 14, borderWidth: 1, borderColor: colors.ink100, padding: 12 },
  readyText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink900 },
  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 72 },
  sparkBar: { flex: 1, borderRadius: 4, backgroundColor: colors.ink600 },
  sparkEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  sparkEnd: { fontSize: 11, color: colors.slate400 },
  disclaimer: { fontSize: 11, color: colors.slate400, lineHeight: 16 },
});
