import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { MY_CHECK_IN_REPORTS } from '../../graphql/portal';
import { Button, Card, Empty, ErrorText, Screen } from '../../components/ui';
import { openAuthedPdf } from '../../lib/documents';
import { fmtDate } from '../../lib/format';
import { colors } from '../../theme';

/** One PDF after each check-in with the doctor: weight, dose and their note. */
export function ReportsScreen() {
  const { data, loading, error, refetch } = useQuery(MY_CHECK_IN_REPORTS, { fetchPolicy: 'cache-and-network' });
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<unknown>(null);
  const reports: any[] = data?.myCheckInReports ?? [];

  const open = async (r: any) => {
    setProblem(null);
    setOpening(r.id);
    try {
      await openAuthedPdf(r.reportUrl, `check-in-report-${r.weekLabel.replace(' ', '-').toLowerCase()}`);
    } catch (e: any) {
      setProblem(e);
    } finally {
      setOpening(null);
    }
  };

  return (
    <Screen title="Check-in reports" subtitle="After each check-in with your doctor: your weight, your dose and their note." refreshing={loading} onRefresh={() => refetch()}>
      {loading && !data && <Empty>Loading…</Empty>}
      {!data && <ErrorText error={error} />}
      {data && reports.length === 0 && <Card><Empty>Your first report appears here once your doctor has reviewed your first check-in.</Empty></Card>}
      <ErrorText error={problem} />
      <View style={{ gap: 10 }}>
        {reports.map((r) => (
          <Card key={r.id} style={styles.row}>
            <View style={styles.icon}><Text style={{ fontSize: 18 }}>📄</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{r.weekLabel} check-in</Text>
              <Text style={styles.sub}>Reviewed {fmtDate(r.reviewedAt)}</Text>
            </View>
            <Button small variant="soft" label="Open PDF" loading={opening === r.id} onPress={() => open(r)} />
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.ink50, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink900 },
  sub: { fontSize: 12, color: colors.slate500, marginTop: 2 },
});
