import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useMutation } from '@apollo/client';
import { PhotoUploadField } from '../../components/PhotoUploadField';
import { SAVE_BODY_PHOTOS_STEP, MY_ONBOARDING } from '../../graphql/onboarding';

export function BodyPhotoScreen({ navigation }: any) {
  const [frontFileId, setFrontFileId] = useState<string | null>(null);
  const [sideFileId, setSideFileId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [saveBodyPhotosStep, { loading }] = useMutation(SAVE_BODY_PHOTOS_STEP, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  const canContinue = !!frontFileId && !!sideFileId;

  const handleContinue = async () => {
    if (!canContinue) return;
    setError('');
    try {
      await saveBodyPhotosStep({
        variables: { input: { bodyPhotoFrontFileId: frontFileId, bodyPhotoSideFileId: sideFileId } },
      });
      navigation.goBack();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Full body photos</Text>
      <Text style={styles.subtitle}>
        Checks like these are a regulatory requirement so we can give you the best treatment possible.
      </Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoItem}>✓ Face clearly visible</Text>
        <Text style={styles.infoItem}>✓ Full body visible, head to toe</Text>
        <Text style={styles.infoItem}>✓ Light-coloured, fitted clothing</Text>
        <Text style={[styles.infoItem, styles.infoItemBad]}>✕ No hoodies, coats, or baggy layers</Text>
      </View>

      <View style={{ gap: 16 }}>
        <PhotoUploadField kind="BODY_PHOTO_FRONT" label="Front-facing" hint="Photo 1 of 2" onUploaded={setFrontFileId} />
        <PhotoUploadField kind="BODY_PHOTO_SIDE" label="Side-facing" hint="Photo 2 of 2" onUploaded={setSideFileId} />
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
  infoItem: { fontSize: 12, color: '#374151', marginTop: 4 },
  infoItemBad: { color: '#f43f5e' },
  error: { color: '#f43f5e', fontSize: 13, marginTop: 12 },
  cta: { backgroundColor: '#0ea5e9', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
