import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { MY_DOSE_CALENDAR, MY_MISSED_DOSE_STATUS, MY_PRODUCT_KIND, MY_SIDE_EFFECT_SCORES } from '../../graphql/portal';
import { AfterDoseCheck } from '../../components/portal/AfterDoseCheck';
import { DoseCalendar } from '../../components/portal/DoseCalendar';
import { DoseHistory } from '../../components/portal/DoseHistory';
import { DoseSheet, STATUS_COLOR } from '../../components/portal/DoseSheet';
import { Button, Card, CardTitle, Columns, Empty, ErrorText, Notice, Pill, Screen } from '../../components/ui';
import { countdown, fmtDate } from '../../lib/format';
import { type Dose, doseName, doseToAskAbout, isRotatingPen, missedDoseAdvice, overdueDose, visualStatus } from '../../lib/doses';
import { lastSiteOf, SITE_LABEL, suggestNextSite } from '../../lib/injectionSites';
import { isScoreCheckDue } from '../../lib/sideEffectScores';
import { colors } from '../../theme';

export function InjectionsScreen({ navigation }: any) {
  const { data, loading, error, refetch } = useQuery(MY_DOSE_CALENDAR, { variables: { fromDays: 60, toDays: 90 }, fetchPolicy: 'cache-and-network' });
  const { data: kindData } = useQuery(MY_PRODUCT_KIND, { fetchPolicy: 'cache-first' });
  const { data: missedData } = useQuery(MY_MISSED_DOSE_STATUS, { fetchPolicy: 'cache-and-network' });
  const glp1 = kindData?.myProductKind === 'GLP1';
  const { data: scoreData } = useQuery(MY_SIDE_EFFECT_SCORES, { fetchPolicy: 'cache-and-network', skip: !glp1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const doses: Dose[] = data?.myDoseCalendar ?? [];
  const selected = doses.find((d) => d.id === selectedId) ?? null;
  const needsClinician = !!missedData?.myMissedDoseStatus?.needsClinician;
  const missedInARow = missedData?.myMissedDoseStatus?.missedInARow ?? 0;
  const next = useMemo(() => doses.filter((d) => d.status === 'SCHEDULED').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0], [doses]);
  const overdue = overdueDose(doses);
  const asked = doseToAskAbout(doses);
  const lastSite = lastSiteOf(doses);
  const injections = kindData?.myProductKind !== 'HRT';
  const scoreDue = glp1 && scoreData && isScoreCheckDue(scoreData.mySideEffectScores);

  const goMore = (screen: string) => navigation.navigate('More', { screen });
  const upcoming = doses.filter((d) => d.status !== 'TAKEN' && d.status !== 'SKIPPED' && visualStatus(d) !== 'DUE' && visualStatus(d) !== 'MISSED').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)).slice(0, 5);

  return (
    <Screen title={injections ? 'Injections' : 'My doses'} subtitle={injections ? 'When each injection is due, and what you’ve taken.' : 'When each dose is due, and what you’ve taken.'} refreshing={loading} onRefresh={() => refetch()}>
      {loading && !data && <Empty>Loading…</Empty>}
      {error && !data && <ErrorText>{error.message}</ErrorText>}
      {!loading && !error && doses.length === 0 && (
        <Card><Empty>{`${injections ? 'Your injection schedule' : 'Your dose schedule'} isn’t ready yet. Your medicine may have no fixed dose days. Take it as your prescription says.`}</Empty></Card>
      )}

      {doses.length > 0 && (
        <>
          {needsClinician && (
            <Notice tone="warn" title={`You’ve missed ${missedInARow} doses in a row`}>
              Please message your clinician before your next injection. After a break, going straight back to your current dose can cause strong side effects, so they may restart you on a lower one.
            </Notice>
          )}
          {!needsClinician && overdue && (
            <Notice tone="warn" title={`Your injection from ${fmtDate(overdue.scheduledFor, { weekday: 'long', day: 'numeric', month: 'long' })} hasn’t been logged`}
              action={<View style={{ marginTop: 10, gap: 4 }}><Button small variant="soft" label="I’ve taken it: log it" onPress={() => setSelectedId(overdue.id)} /><Button small variant="link" label="Message my care team →" onPress={() => navigation.navigate('Messages')} /></View>}>
              {missedDoseAdvice(overdue, false) ?? 'If you haven’t taken it, message your care team before taking it late.'}
            </Notice>
          )}
          {scoreDue && (
            <Card style={{ marginBottom: 14 }}>
              <CardTitle title="How have you been this week?" subtitle="A one-minute check on side effects. Your doctor reads it before approving your next dose." />
              <Button label="Log this week" onPress={() => goMore('SideEffects')} />
            </Card>
          )}
          {asked && <AfterDoseCheck dose={{ id: asked.id, takenAt: asked.takenAt! }} doseName={doseName(asked)} />}

          {next && (
            <Card style={{ marginBottom: 14 }}>
              <Text style={styles.eyebrow}>NEXT {injections ? 'INJECTION' : 'DOSE'}</Text>
              <Text style={styles.nextName}>{doseName(next)}</Text>
              <Text style={styles.nextWhen}>{fmtDate(next.scheduledFor, { weekday: 'long', day: 'numeric', month: 'long' })} · <Text style={styles.bold}>{countdown(next.scheduledFor)}</Text></Text>
              {isRotatingPen(next) && <Text style={styles.nextWhen}>Try the <Text style={styles.bold}>{SITE_LABEL[suggestNextSite(lastSite)].toLowerCase()}</Text></Text>}
              <Button small label="Open" onPress={() => setSelectedId(next.id)} style={{ alignSelf: 'flex-start', marginTop: 12 }} />
            </Card>
          )}

          <Columns>
            <Card>
              <CardTitle title="Calendar" subtitle="Tap a day with a dose to log it." />
              <DoseCalendar doses={doses} onOpen={(d) => setSelectedId(d.id)} />
            </Card>
            <Card>
              <CardTitle title="Coming up" />
              {upcoming.length === 0 ? <Empty>Your next doses will appear here once they are scheduled.</Empty> : upcoming.map((d, i) => {
                const c = STATUS_COLOR[visualStatus(d)];
                return (
                  <View key={d.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <View style={[styles.dot, { backgroundColor: c.solid }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{fmtDate(d.scheduledFor, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                      <Text style={styles.rowSub}>{doseName(d)}</Text>
                    </View>
                    <Pill label={countdown(d.scheduledFor)} tone="info" />
                    <Button small variant="link" label="Open" onPress={() => setSelectedId(d.id)} />
                  </View>
                );
              })}
            </Card>
          </Columns>

          <View style={{ marginTop: 14 }}><DoseHistory doses={doses} /></View>
        </>
      )}

      <DoseSheet dose={selected} needsClinician={needsClinician} lastSite={lastSite} onClose={() => setSelectedId(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 11, fontWeight: '800', color: colors.ink700, letterSpacing: 0.8 },
  nextName: { fontSize: 20, fontWeight: '800', color: colors.slate900, marginTop: 4 },
  nextWhen: { fontSize: 13, color: colors.slate500, marginTop: 3 },
  bold: { fontWeight: '700', color: colors.slate800 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.slate100 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.slate800 },
  rowSub: { fontSize: 12, color: colors.slate500 },
});
