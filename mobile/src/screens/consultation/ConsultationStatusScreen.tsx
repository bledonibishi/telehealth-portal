import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@apollo/client';
import { MY_CONSULTATIONS } from '../../graphql/operations';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  SUBMITTED: { label: 'Submitted', color: '#3b82f6' },
  IN_REVIEW: { label: 'In review', color: '#f59e0b' },
  MORE_INFO_REQUESTED: { label: 'Awaiting info', color: '#f97316' },
  APPROVED: { label: 'Approved', color: '#22c55e' },
  DECLINED: { label: 'Declined', color: '#9ca3af' },
};

export function ConsultationStatusScreen({ navigation }: any) {
  const { data, loading, error, refetch } = useQuery(MY_CONSULTATIONS, { fetchPolicy: 'network-only' });

  if (loading) return <ActivityIndicator style={styles.center} />;
  if (error) return <Text style={styles.error}>{error.message}</Text>;

  const consultations = data?.myConsultations ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My consultations</Text>
      <FlatList
        data={consultations}
        keyExtractor={(item: any) => item.id}
        onRefresh={refetch}
        refreshing={loading}
        ListEmptyComponent={
          <Text style={styles.empty}>No consultations yet. Start one from the New Consultation tab.</Text>
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
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 16 },
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
