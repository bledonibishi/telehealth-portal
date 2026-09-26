import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useMutation } from '@apollo/client';
import { PhotoUploadField } from '../../components/PhotoUploadField';
import { SAVE_IDENTITY_STEP, MY_ONBOARDING } from '../../graphql/onboarding';

export function IdPhotoScreen({ navigation }: any) {
  const [idDocumentFileId, setIdDocumentFileId] = useState<string | null>(null);
  const [selfieFileId, setSelfieFileId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [saveIdentityStep, { loading }] = useMutation(SAVE_IDENTITY_STEP, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  const canContinue = !!idDocumentFileId && !!selfieFileId;

  const handleContinue = async () => {
    if (!canContinue) return;
    setError('');
    try {
      await saveIdentityStep({ variables: { input: { idDocumentFileId, selfieFileId } } });
      navigation.goBack();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Verify your identity</Text>
      <Text style={styles.subtitle}>
        This is legally required before we can prescribe and is only used for this verification.
      </Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Before you start</Text>
        <Text style={styles.infoItem}>✓ Have a valid ID ready (e.g. passport, driving licence)</Text>
        <Text style={styles.infoItem}>✓ Find a well-lit spot for your selfie</Text>
      </View>

      <View style={{ gap: 16 }}>
        <PhotoUploadField
          kind="ID_DOCUMENT"
          label="Government ID"
          hint="Passport or driving licence, all corners visible"
          onUploaded={setIdDocumentFileId}
        />
        <PhotoUploadField kind="SELFIE" label="Selfie" hint="Look directly at the camera" onUploaded={setSelfieFileId} />
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.cta, (!canContinue || loading) && styles.ctaDisabled]}
        disabled={!canContinue || loading}
        onPress={handleContinue}
      >
        <Text style={styles.ctaText}>{loading ? 'Saving…' : 'Continue'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 8, lineHeight: 20 },
  infoBox: { backgroundColor: '#e0f2fe', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 14, padding: 14, marginTop: 20, marginBottom: 20 },
  infoTitle: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8 },
  infoItem: { fontSize: 12, color: '#374151', marginTop: 4 },
  error: { color: '#f43f5e', fontSize: 13, marginTop: 12 },
  cta: { backgroundColor: '#0ea5e9', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
