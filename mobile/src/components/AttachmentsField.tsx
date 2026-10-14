import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage, type UploadKind } from '../lib/upload';
import { BottomSheet, SheetOption } from './BottomSheet';
import { Button, ErrorText } from './ui';
import { colors } from '../theme';

export type Attachment = { id: string; uri: string; name: string };

/**
 * A few photos or screenshots to send along with something: each is uploaded as soon as it is chosen, shown as a small
 * picture that can be removed, and only its id is kept. The button opens a sheet to take a photo or pick one from the library.
 */
export function AttachmentsField({
  kind,
  files,
  onChange,
  max = 3,
  label = 'Attach a photo or screenshot',
  disabled,
  onUploadingChange,
}: {
  kind: UploadKind;
  files: Attachment[];
  onChange: (next: Attachment[]) => void;
  max?: number;
  label?: string;
  disabled?: boolean;
  /** Tells the form when a picture is still on its way up, so it can hold the Send button until the file is attached. */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { onUploadingChange?.(uploading); }, [uploading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.length) return;
    setError(null);
    setUploading(true);
    try {
      const added: Attachment[] = [];
      for (const asset of result.assets.slice(0, max - files.length)) {
        const id = await uploadImage(kind, { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType });
        added.push({ id, uri: asset.uri, name: asset.fileName ?? 'photo.jpg' });
      }
      onChange([...files, ...added]);
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
    }
  };

  // The sheet slides away first; the camera or library opens once it has gone.
  const closeThen = (action: () => void) => {
    setSheetOpen(false);
    setTimeout(action, 250);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Camera access needed', 'Enable camera access in Settings to take a photo.');
    handle(await ImagePicker.launchCameraAsync({ quality: 0.8 }));
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Photo library access needed', 'Enable photo access in Settings to choose a photo or screenshot.');
    handle(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsMultipleSelection: max - files.length > 1, selectionLimit: Math.max(max - files.length, 1) }));
  };

  return (
    <View style={s.wrap}>
      {files.length > 0 && (
        <View style={s.row}>
          {files.map((f) => (
            <View key={f.id} style={s.thumbWrap}>
              <Image source={{ uri: f.uri }} style={s.thumb} accessibilityLabel={f.name} />
              <Pressable onPress={() => onChange(files.filter((x) => x.id !== f.id))} accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`} style={s.remove} hitSlop={8}>
                <Text style={s.removeText}>✕</Text>
              </Pressable>
            </View>
          ))}
          {uploading && <View style={[s.thumb, s.loading]}><ActivityIndicator color={colors.ink700} /></View>}
        </View>
      )}
      {files.length < max && (
        <Button label={uploading ? 'Uploading…' : files.length ? 'Add another' : `📎  ${label}`} variant="soft" small disabled={disabled || uploading} onPress={() => setSheetOpen(true)} />
      )}
      <Text style={s.hint}>Up to {max} photos or screenshots, 10 MB each.</Text>
      <ErrorText error={error} />

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={label}>
        <SheetOption icon="📷" label="Take photo" hint="Use your camera now" primary onPress={() => closeThen(takePhoto)} />
        <SheetOption icon="🖼️" label="Choose from library" hint="A photo or screenshot you already have" onPress={() => closeThen(pickFromLibrary)} />
        <Pressable onPress={() => setSheetOpen(false)} style={s.cancel} accessibilityRole="button">
          <Text style={s.cancelText}>Cancel</Text>
        </Pressable>
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { width: 76, height: 76 },
  thumb: { width: 76, height: 76, borderRadius: 12, backgroundColor: colors.slate100 },
  loading: { alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.slate700, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  hint: { fontSize: 12, color: colors.slate400 },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontSize: 14, color: colors.slate500, fontWeight: '500' },
});
