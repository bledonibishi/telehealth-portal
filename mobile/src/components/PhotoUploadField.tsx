import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage, UploadKind } from '../lib/upload';
import { BottomSheet, SheetOption } from './BottomSheet';
import { colors } from '../theme';

/**
 * One photo to upload. The button opens a sheet from the bottom of the screen to take a photo or
 * choose one from the library; the picked photo is shown and uploaded straight away.
 */
export function PhotoUploadField({
  kind,
  label,
  hint,
  buttonLabel = 'Add a photo',
  onUploaded,
}: {
  kind: UploadKind;
  label: string;
  hint?: string;
  buttonLabel?: string;
  onUploaded: (fileId: string) => void;
}) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

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

  // The sheet slides away first; the camera or library opens once it has gone.
  const closeThen = (action: () => void) => {
    setSheetOpen(false);
    setTimeout(action, 250);
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
          <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="contain" />
          {status === 'uploading' && (
            <View style={styles.overlay}>
              <ActivityIndicator color={colors.brand600} />
            </View>
          )}
          <TouchableOpacity onPress={() => setSheetOpen(true)}>
            <Text style={styles.retake}>Use a different photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.addButton} onPress={() => setSheetOpen(true)} accessibilityRole="button">
          <Text style={styles.addButtonText}>📷  {buttonLabel}</Text>
        </TouchableOpacity>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={label}>
        <SheetOption icon="📷" label="Take photo" hint="Use your camera now" primary onPress={() => closeThen(takePhoto)} />
        <SheetOption icon="🖼️" label="Choose from library" hint="A photo or screenshot you already have" onPress={() => closeThen(pickFromLibrary)} />
        <TouchableOpacity onPress={() => setSheetOpen(false)} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { borderWidth: 1, borderColor: colors.slate200, borderRadius: 16, padding: 16, backgroundColor: colors.white },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '500', color: colors.slate900 },
  hint: { fontSize: 12, color: colors.slate400, marginTop: 2 },
  doneBadge: { backgroundColor: colors.brand50, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  doneBadgeText: { fontSize: 11, fontWeight: '500', color: colors.brand700 },
  preview: { width: '100%', height: 240, borderRadius: 12, backgroundColor: colors.slate50 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  retake: { marginTop: 8, fontSize: 12, color: colors.brand700, fontWeight: '500' },
  addButton: { backgroundColor: colors.brand600, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  addButtonText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontSize: 14, color: colors.slate500, fontWeight: '500' },
  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
});
