import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { MY_ONBOARDING, SUBMIT_ONBOARDING } from '../../graphql/onboarding';

type StepKey = 'IdPhoto' | 'BodyPhoto' | 'PrescriptionProof';

export function OnboardingChecklistScreen({ navigation }: any) {
  const { data, loading, error, refetch } = useQuery(MY_ONBOARDING, { fetchPolicy: 'network-only' });
  const [submitOnboarding, { loading: submitting }] = useMutation(SUBMIT_ONBOARDING, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  const o = data?.myOnboarding;

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', refetch);
    return unsubscribe;
  }, [navigation, refetch]);

  useEffect(() => {
    if (o?.status === 'APPROVED') {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    }
  }, [o?.status, navigation]);

  if (loading && !o) return <ActivityIndicator style={styles.center} />;
  if (error) return <Text style={styles.error}>{error.message}</Text>;
  if (!o) return null;

  const idPhotoDone = !!o.idDocumentUrl && !!o.selfieUrl;
  const bodyPhotoDone = !!o.bodyPhotoFrontUrl && !!o.bodyPhotoSideUrl;
  const prescriptionProofDone = o.priorMedicationUse === false || (!!o.priorMedicationUse && !!o.prescriptionProofUrl);

  const steps: { key: StepKey; label: string; hint: string; done: boolean }[] = [
    { key: 'IdPhoto', label: 'ID Photo', hint: 'A government ID and a selfie', done: idPhotoDone },
    { key: 'BodyPhoto', label: 'Full body photo', hint: 'Two full body photos, front and side', done: bodyPhotoDone },
    { key: 'PrescriptionProof', label: 'Proof of prescription', hint: 'Only if you’ve used this medication before', done: prescriptionProofDone },
  ];

  const firstIncomplete = steps.find((s) => !s.done);
  const allDone = !firstIncomplete;

  if (o.status === 'PENDING_REVIEW') {
    return (
      <View style={styles.center}>
        <View style={styles.pendingIcon}>
          <Text style={{ fontSize: 24 }}>⏳</Text>
        </View>
        <Text style={styles.pendingTitle}>Under review</Text>
        <Text style={styles.pendingBody}>
          Thanks — your documents are with our clinical team. We&rsquo;ll notify you once they&rsquo;re reviewed.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {o.status === 'REJECTED' && (
        <View style={styles.rejectedBox}>
          <Text style={styles.rejectedTitle}>Your submission needs another look</Text>
          {!!o.rejectionReason && <Text style={styles.rejectedBody}>{o.rejectionReason}</Text>}
        </View>
      )}

      <View style={styles.pill}>
        <Text style={styles.pillText}>About 6 minutes</Text>
      </View>

      <Text style={styles.title}>You&rsquo;re almost there</Text>
      <Text style={styles.subtitle}>We need a few final details to meet clinical and regulatory requirements.</Text>

      <Text style={styles.sectionLabel}>What&rsquo;s left</Text>

      <View style={styles.card}>
        <View style={[styles.row, styles.rowBorder]}>
          <View style={[styles.stepIcon, styles.stepIconDone]}>
            <Text style={styles.stepIconText}>✓</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepLabel}>Basic information</Text>
            <Text style={styles.stepHint}>Completed</Text>
          </View>
        </View>

        {steps.map((s, i) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.row, i < steps.length - 1 && styles.rowBorder]}
            onPress={() => navigation.navigate(s.key)}
          >
            <View style={[styles.stepIcon, s.done && styles.stepIconDone]}>
              <Text style={[styles.stepIconText, !s.done && styles.stepIconTextPending]}>{s.done ? '✓' : i + 2}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepLabel}>{s.label}</Text>
              <Text style={styles.stepHint}>{s.hint}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.footnote}>
        Your data is encrypted. A clinician reviews every application personally.
      </Text>

      <TouchableOpacity
        style={[styles.cta, submitting && styles.ctaDisabled]}
        disabled={submitting}
        onPress={() => (allDone ? submitOnboarding() : navigation.navigate(firstIncomplete!.key))}
      >
        <Text style={styles.ctaText}>{submitting ? 'Submitting…' : allDone ? 'Submit for review' : 'Resume'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  error: { color: '#f43f5e', margin: 16 },
  pendingIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  pendingTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  pendingBody: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  rejectedBox: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#ffe4e6', borderRadius: 12, padding: 14, marginBottom: 16 },
  rejectedTitle: { color: '#f43f5e', fontWeight: '600', fontSize: 14 },
  rejectedBody: { color: '#f43f5e', fontSize: 13, marginTop: 4 },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#bae6fd', backgroundColor: '#e0f2fe', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16 },
  pillText: { fontSize: 12, fontWeight: '600', color: '#0369a1' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 8, lineHeight: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 32, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  stepIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  stepIconDone: { backgroundColor: '#e0f2fe' },
  stepIconText: { fontSize: 13, fontWeight: '600', color: '#0369a1' },
  stepIconTextPending: { color: '#6b7280' },
  stepLabel: { fontSize: 14, fontWeight: '500', color: '#111827' },
  stepHint: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  chevron: { fontSize: 20, color: '#d1d5db' },
  footnote: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 20 },
  cta: { backgroundColor: '#0ea5e9', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
