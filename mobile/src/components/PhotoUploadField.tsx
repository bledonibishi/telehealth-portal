import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage, UploadKind } from '../lib/upload';

export function PhotoUploadField({
  kind,
  label,
  hint,
  onUploaded,
}: {
  kind: UploadKind;
  label: string;
  hint?: string;
  onUploaded: (fileId: string) => void;
}) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleResult = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPreviewUri(asset.uri);
    setStatus('uploading');
    setError('');
    try {
      const fileId = await uploadImage(kind, {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      });
      setStatus('done');
      onUploaded(fileId);
    } catch (err: any) {
      setStatus('error');
      setError(err.message ?? 'Upload failed');
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Enable camera access in Settings to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    handleResult(result);
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo library access needed', 'Enable photo access in Settings to upload a file.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    handleResult(result);
  };

  return (
    <View style={styles.field}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{label}</Text>
          {!!hint && <Text style={styles.hint}>{hint}</Text>}
        </View>
        {status === 'done' && (
          <View style={styles.doneBadge}>
            <Text style={styles.doneBadgeText}>✓ Uploaded</Text>
          </View>
        )}
      </View>

      {previewUri ? (
        <View>
          <Image source={{ uri: previewUri }} style={styles.preview} />
          {status === 'uploading' && (
            <View style={styles.overlay}>
              <ActivityIndicator color="#0ea5e9" />
            </View>
          )}
          <TouchableOpacity onPress={() => { setPreviewUri(null); setStatus('idle'); }}>
            <Text style={styles.retake}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={takePhoto}>
            <Text style={styles.primaryButtonText}>Take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickFromLibrary}>
            <Text style={styles.secondaryButtonText}>Upload file</Text>
          </TouchableOpacity>
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, padding: 16, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '500', color: '#111827' },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  doneBadge: { backgroundColor: '#ecfdf5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  doneBadgeText: { fontSize: 11, fontWeight: '500', color: '#0d9488' },
  preview: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#f3f4f6' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  retake: { marginTop: 8, fontSize: 12, color: '#9ca3af' },
  buttonRow: { flexDirection: 'row', gap: 8 },
  primaryButton: { flex: 1, backgroundColor: '#0ea5e9', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  error: { color: '#f43f5e', fontSize: 12, marginTop: 8 },
});
