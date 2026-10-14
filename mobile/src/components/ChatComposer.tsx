import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AttachmentsField, type Attachment } from './AttachmentsField';
import { Button, ErrorText } from './ui';
import { colors } from '../theme';

/**
 * The box a message is written in: the words, a paperclip that opens the photo picker, and Send. Pictures chosen are
 * shown above the box and can be taken off again. Send is on while there are words or a picture, and not while one is uploading.
 */
export function ChatComposer({
  value,
  onChangeText,
  onSend,
  sending,
  files,
  onFilesChange,
  problem,
  note,
  bottomInset = true,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending?: boolean;
  files: Attachment[];
  onFilesChange: (next: Attachment[]) => void;
  problem?: unknown;
  note?: string;
  /** Leave room for the phone's home bar. Off when something else (a tab bar) already does. */
  bottomInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [picking, setPicking] = useState(false);
  const canSend = (value.trim().length > 0 || files.length > 0) && !sending;
  return (
    <View style={[s.wrap, { paddingBottom: bottomInset ? Math.max(insets.bottom, 12) : 12 }]}>
      {(picking || files.length > 0) && (
        <View style={s.files}>
          <AttachmentsField kind="SUPPORT_ATTACHMENT" files={files} onChange={onFilesChange} label="Attach a photo or screenshot" />
        </View>
      )}
      <ErrorText error={problem} />
      <View style={s.row}>
        <Pressable onPress={() => setPicking((p) => !p)} accessibilityRole="button" accessibilityLabel="Attach a photo or screenshot" style={({ pressed }) => [s.clip, pressed && { opacity: 0.6 }]}>
          <Text style={s.clipText}>📎</Text>
        </Pressable>
        <TextInput style={s.input} value={value} onChangeText={onChangeText} placeholder="Write a message…" placeholderTextColor={colors.slate400} multiline maxLength={2000} />
        <Button label="Send" small onPress={onSend} disabled={!canSend} loading={sending} />
      </View>
      {!!note && <Text style={s.note}>{note}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: colors.slate100, backgroundColor: colors.white, paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  files: { paddingBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  clip: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.slate100 },
  clipText: { fontSize: 18 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.slate200, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, maxHeight: 120, color: colors.slate900 },
  note: { fontSize: 11, color: colors.slate400, textAlign: 'center' },
});
