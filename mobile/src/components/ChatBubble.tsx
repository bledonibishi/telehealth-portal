import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthedImage } from './AuthedImage';
import { colors } from '../theme';
import { fmtTime } from '../lib/format';

export type BubbleFile = { id: string; filename: string; mimeType: string };

/**
 * One chat message: the patient's own on the right, the care team's on the left. A reply from the automated assistant says
 * so above the words. Files sent with it show under the text: pictures as small thumbnails, anything else by name.
 */
export function ChatBubble({ mine, text, sentAt, assistant, files }: { mine: boolean; text: string; sentAt: string; assistant?: boolean; files?: BubbleFile[] }) {
  return (
    <View style={[s.bubble, mine ? s.mine : s.theirs]}>
      {!!assistant && <Text style={s.tag}>Automated assistant</Text>}
      {!!text && <Text style={[s.text, mine && { color: colors.white }]}>{text}</Text>}
      {!!files?.length && (
        <View style={s.files}>
          {files.map((f) =>
            f.mimeType.startsWith('image/') ? (
              <AuthedImage key={f.id} fileId={f.id} style={s.thumb} />
            ) : (
              <Text key={f.id} style={[s.fileName, mine && { color: colors.white }]}>📄 {f.filename}</Text>
            ),
          )}
        </View>
      )}
      <Text style={[s.time, mine && { color: colors.brand100 }]}>{fmtTime(sentAt)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bubble: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brand600, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate100, borderBottomLeftRadius: 6 },
  tag: { fontSize: 11, fontWeight: '700', color: colors.ink700, marginBottom: 2 },
  text: { fontSize: 15, color: colors.slate900, lineHeight: 20 },
  files: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  thumb: { width: 132, height: 100, borderRadius: 10, backgroundColor: colors.slate100 },
  fileName: { fontSize: 13, color: colors.ink700, textDecorationLine: 'underline' },
  time: { fontSize: 10, color: colors.slate400, marginTop: 3, alignSelf: 'flex-end' },
});
