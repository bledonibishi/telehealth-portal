import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@apollo/client';
import { MY_CONSULTATIONS, MY_TREATMENT_PLAN } from '../../graphql/operations';
import { careStage } from '../../lib/careStage';
import { signOut } from '../../lib/session';

// The doctor's decision arrives while the app is open: look again this often.
const POLL_MS = 30_000;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  SUBMITTED: { label: 'Submitted', color: '#3b82f6' },
  IN_REVIEW: { label: 'In review', color: '#f59e0b' },
  MORE_INFO_REQUESTED: { label: 'Awaiting info', color: '#f97316' },
  APPROVED: { label: 'Approved', color: '#22c55e' },
  DECLINED: { label: 'Declined', color: '#9ca3af' },
};

export function ConsultationStatusScreen({ navigation }: any) {
  const { data, loading, error, refetch } = useQuery(MY_CONSULTATIONS, { fetchPolicy: 'network-only', pollInterval: POLL_MS });
  const { data: planData, refetch: refetchPlan } = useQuery(MY_TREATMENT_PLAN, { fetchPolicy: 'network-only', pollInterval: POLL_MS });

  // Coming back to this tab shows where things stand now.
  React.useEffect(() => navigation.addListener('focus', () => { refetch(); refetchPlan(); }), [navigation, refetch, refetchPlan]);

  if (loading && !data) return <ActivityIndicator style={styles.center} />;
  if (error && !data) return <Text style={styles.error}>{error.message}</Text>;

  const consultations = data?.myConsultations ?? [];
  const plan = planData?.myTreatmentPlan;
  const next = careStage(consultations, plan);

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>My consultations</Text>
        <TouchableOpacity onPress={signOut}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity>
      </View>
      <FlatList
        ListHeaderComponent={
          <View>
            <View style={[styles.stage, next.stage === 'MORE_INFO' && styles.stageWarn, next.stage === 'DECLINED' && styles.stageMuted]}>
              <Text style={styles.stageTitle}>{next.title}</Text>
              <Text style={styles.stageText}>{next.text}</Text>
              {next.action && (
                <TouchableOpacity style={styles.stageButton} onPress={() => navigation.navigate(next.action!.tab)}>
                  <Text style={styles.stageButtonText}>{next.action.label}</Text>
                </TouchableOpacity>
              )}
            </View>
            {plan && (
              <View style={styles.plan}>
                <Text style={styles.planLabel}>Current treatment plan</Text>
                <Text style={styles.planName}>{plan.productName}{plan.strength ? ` · ${plan.strength}` : ''}</Text>
                {!!plan.directions && <Text style={styles.planLine}>{plan.directions}</Text>}
                {!!plan.frequency && <Text style={styles.planLine}>Frequency: {plan.frequency}</Text>}
                {plan.nextDoseAt && <Text style={styles.planLine}>Next dose: {new Date(plan.nextDoseAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>}
                {plan.dosesPlanned > 0 && <Text style={styles.planLine}>Doses taken: {plan.dosesTaken} of {plan.dosesPlanned}</Text>}
                {plan.repeatsLeft != null && <Text style={styles.planLine}>Repeats left: {plan.repeatsLeft}</Text>}
                {!!plan.prescriberName && <Text style={styles.planMeta}>Prescribed by {plan.prescriberName}</Text>}
              </View>
            )}
          </View>
        }
        data={consultations}
        keyExtractor={(item: any) => item.id}
        onRefresh={refetch}
        refreshing={loading}
        ListEmptyComponent={
          <Text style={styles.empty}>No consultations yet.</Text>
        }
        renderItem={({ item }: any) => {
          const badge = STATUS_LABELS[item.status] ?? { label: item.status, color: '#9ca3af' };
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('Messages', { consultationId: item.id })}
            >
              <View style={styles.row}>
                <Text style={styles.kind}>{item.kind}</Text>
                <View style={[styles.badge, { borderColor: badge.color }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              </View>
              <Text style={styles.date}>
                Submitted {new Date(item.submittedAt).toLocaleDateString('en-GB')}
              </Text>
              {item.prescription && (
                <Text style={styles.rx}>
                  Rx: {item.prescription.medication} · {item.prescription.dosage}
                </Text>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '600', color: '#111827' },
  signOut: { fontSize: 13, color: '#6b7280' },
  stage: { backgroundColor: '#e0f2fe', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#bae6fd' },
  stageWarn: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  stageMuted: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
  stageTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  stageText: { fontSize: 13, color: '#4b5563', marginTop: 4, lineHeight: 19 },
  stageButton: { alignSelf: 'flex-start', backgroundColor: '#0ea5e9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: 12 },
  stageButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  plan: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  planLabel: { fontSize: 12, fontWeight: '600', color: '#0369a1' },
  planName: { fontSize: 17, fontWeight: '700', color: '#111827', marginTop: 4 },
  planLine: { fontSize: 13, color: '#374151', marginTop: 4 },
  planMeta: { fontSize: 12, color: '#9ca3af', marginTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  kind: { fontSize: 15, fontWeight: '500', color: '#111827' },
  badge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '500' },
  date: { fontSize: 13, color: '#6b7280' },
  rx: { fontSize: 13, color: '#22c55e', marginTop: 4 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 },
  center: { flex: 1, justifyContent: 'center' },
  error: { color: '#f43f5e', margin: 16 },
});
