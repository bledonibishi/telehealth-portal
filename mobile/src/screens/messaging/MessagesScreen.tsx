import React, { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { ChatBubble } from '../../components/ChatBubble';
import { ChatComposer } from '../../components/ChatComposer';
import type { Attachment } from '../../components/AttachmentsField';
import { Button } from '../../components/ui';
import { useConversation, type ChatMessage } from '../../lib/useConversation';
import { colors } from '../../theme';

// Starting points for someone who doesn't know what to write: each fills the message box, and nothing is sent until they press Send.
const STARTERS = [
  { label: 'Where is my order?', text: 'Hello, could you tell me where my order is?' },
  { label: 'A question about my treatment', text: 'Hello, I have a question about my treatment: ' },
  { label: 'Help with my account or a payment', text: 'Hello, I need help with my account or a payment: ' },
  { label: 'Something isn’t working in the app', text: 'Hello, something isn’t working in the app: ' },
];

/**
 * Help and messages in one place: the patient's conversation with the care team (and the automated assistant for everyday
 * questions), with a way to send a written request about something specific.
 */
export function MessagesScreen({ navigation }: any) {
  const focused = useIsFocused();
  const { messages, me, loading, sending, send } = useConversation({ active: focused });
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [problem, setProblem] = useState<unknown>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const submit = async () => {
    const text = content.trim();
    if ((!text && files.length === 0) || sending) return;
    setProblem(null);
    try {
      await send(text, files.map((f) => f.id));
      setContent('');
      setFiles([]);
    } catch (err) {
      setProblem(err); // not sent: the words stay in the box
    }
  };

  return (
    <SafeAreaView style={s.page} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 52 : 0}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title} accessibilityRole="header">Help & messages</Text>
            <Text style={s.subtitle}>Write to us here. Only you and our team can read this.</Text>
          </View>
          <Button label="Send a request" small variant="outline" onPress={() => navigation.navigate('Help')} />
        </View>

        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          contentContainerStyle={messages.length ? s.list : s.emptyList}
          data={messages}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            loading ? null : (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>💬</Text>
                <Text style={s.emptyTitle}>How can we help?</Text>
                <Text style={s.emptyBody}>Write to us about your treatment, a delivery, a payment or your account. Questions about your health go to your care team, who reply here.</Text>
                <View style={s.starters}>
                  {STARTERS.map((q) => <Button key={q.label} label={q.label} variant="soft" small onPress={() => setContent(q.text)} />)}
                </View>
              </View>
            )
          }
          renderItem={({ item: m }) => (
            <ChatBubble mine={m.senderId === me || (m.senderRole === 'PATIENT' && !me)} text={m.content} sentAt={m.sentAt} assistant={m.isAi} files={m.attachments} />
          )}
        />

        <ChatComposer
          value={content}
          onChangeText={setContent}
          onSend={submit}
          sending={sending}
          files={files}
          onFilesChange={setFiles}
          problem={problem}
          note="In a medical emergency, call your local emergency number instead of using chat."
          bottomInset={false}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink900, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: colors.slate500, marginTop: 2 },
  list: { padding: 16, gap: 8 },
  emptyList: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  empty: { alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.ink900 },
  emptyBody: { fontSize: 14, color: colors.slate500, textAlign: 'center', lineHeight: 20 },
  starters: { alignSelf: 'stretch', gap: 8, marginTop: 10 },
});
