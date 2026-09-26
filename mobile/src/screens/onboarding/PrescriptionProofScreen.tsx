import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { PhotoUploadField } from '../../components/PhotoUploadField';
import { MY_ONBOARDING, SAVE_PRIOR_MEDICATION_USE, SAVE_PRESCRIPTION_PROOF_STEP } from '../../graphql/onboarding';

const PROOF_TYPES: { value: string; label: string; hint: string; fastest?: boolean }[] = [
  { value: 'MEDICINE_BOX_LABEL', label: 'Medicine box label', hint: 'Pharmacy sticker on your box, bottle, or pen', fastest: true },
  { value: 'PRESCRIPTION_DOCUMENT', label: 'Prescription document', hint: 'Prescription or notification issued by your GP' },
  { value: 'PHARMACY_RECORD', label: 'Pharmacy record', hint: 'Dispensing records, repeat medication lists, or medication history' },
  { value: 'ORDER_CONFIRMATION', label: 'Order confirmation', hint: 'Confirmation email or receipt from a previous order' },
];

export function PrescriptionProofScreen({ navigation }: any) {
  const { data, loading: loadingOnboarding } = useQuery(MY_ONBOARDING, { fetchPolicy: 'network-only' });
  const o = data?.myOnboarding;

  const [priorUse, setPriorUse] = useState<boolean | null>(null);
  const [proofType, setProofType] = useState<string | null>(null);
  const [proofFileId, setProofFileId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [savePriorMedicationUse, { loading: savingPriorUse }] = useMutation(SAVE_PRIOR_MEDICATION_USE, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });
  const [savePrescriptionProofStep, { loading: savingProof }] = useMutation(SAVE_PRESCRIPTION_PROOF_STEP, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  const effectivePriorUse = priorUse ?? o?.priorMedicationUse ?? null;

  if (loadingOnboarding) return <ActivityIndicator style={styles.center} />;

  const handleNo = async () => {
    setError('');
    try {
      await savePriorMedicationUse({ variables: { priorMedicationUse: false } });
      navigation.goBack();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  const handleYes = async () => {
    setError('');
    setPriorUse(true);
    try {
      await savePriorMedicationUse({ variables: { priorMedicationUse: true } });
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  const handleContinue = async () => {
    if (!proofType || !proofFileId) return;
    setError('');
    try {
      await savePrescriptionProofStep({
        variables: { input: { prescriptionProofType: proofType, prescriptionProofFileId: proofFileId } },
      });
      navigation.goBack();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  if (effectivePriorUse === null) {
    return (
      <View style={[styles.container, styles.content]}>
        <Text style={styles.title}>Have you used this medication before?</Text>
        <Text style={styles.subtitle}>
          If you have an existing prescription, we can verify your dose without repeating the full clinical review.
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={{ gap: 12, marginTop: 24 }}>
          <TouchableOpacity style={styles.choice} disabled={savingPriorUse} onPress={handleYes}>
            <Text style={styles.choiceText}>Yes, I have a current prescription</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.choice} disabled={savingPriorUse} onPress={handleNo}>
            <Text style={styles.choiceText}>No, this is my first time</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>What proof do you have?</Text>
      <Text style={styles.subtitle}>
        We need to verify your current prescription so you can continue at the right dose. Choose the one you have to
        hand.
      </Text>

      <View style={{ gap: 8, marginTop: 20 }}>
        {PROOF_TYPES.map((t) => {
          const selected = proofType === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              style={[styles.proofOption, selected && styles.proofOptionSelected]}
              onPress={() => setProofType(t.value)}
            >
              <View style={[styles.radio, selected && styles.radioSelected]} />
              <View style={{ flex: 1 }}>
                <View style={styles.proofHeader}>
                  <Text style={styles.proofLabel}>{t.label}</Text>
                  {t.fastest && (
                    <View style={styles.fastestBadge}>
                      <Text style={styles.fastestBadgeText}>FASTEST TO VERIFY</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.proofHint}>{t.hint}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {!!proofType && (
        <View style={{ marginTop: 20 }}>
          <PhotoUploadField kind="PRESCRIPTION_PROOF" label="Upload proof" onUploaded={setProofFileId} />
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.cta, (!proofType || !proofFileId || savingProof) && styles.ctaDisabled]}
        disabled={!proofType || !proofFileId || savingProof}
        onPress={handleContinue}
      >
        <Text style={styles.ctaText}>{savingProof ? 'Saving…' : 'Continue'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 8, lineHeight: 20 },
  error: { color: '#f43f5e', fontSize: 13, marginTop: 12 },
  choice: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#fff' },
  choiceText: { fontSize: 14, fontWeight: '500', color: '#111827' },
  proofOption: { flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 14, backgroundColor: '#fff' },
  proofOptionSelected: { borderColor: '#0ea5e9', backgroundColor: '#e0f2fe' },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', marginTop: 2 },
  radioSelected: { borderColor: '#0ea5e9', backgroundColor: '#0ea5e9' },
  proofHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  proofLabel: { fontSize: 14, fontWeight: '500', color: '#111827' },
  fastestBadge: { backgroundColor: '#bae6fd', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  fastestBadgeText: { fontSize: 9, fontWeight: '700', color: '#0369a1' },
  proofHint: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  cta: { backgroundColor: '#0ea5e9', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
