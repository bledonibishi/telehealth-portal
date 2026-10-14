import React, { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatBubble } from '../../components/ChatBubble';
import { ChatComposer } from '../../components/ChatComposer';
import type { Attachment } from '../../components/AttachmentsField';
import { useConversation, type ChatMessage } from '../../lib/useConversation';
import { colors } from '../../theme';

/**
 * The care-team chat during onboarding, opened as a sheet from the bottom of the screen. It works
 * before the patient has a consultation: those messages move onto the consultation once the medical
 * questionnaire is submitted (see ConsultationsService.submitIntakeQuiz).
 */
export function OnboardingChatScreen({ navigation, route }: any) {
  const { messages, me, loading, sending, send } = useConversation();
  const [content, setContent] = useState<string>(route?.params?.draft ?? '');
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
      setProblem(err);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Your care team</Text>
          <Text style={styles.headerSub}>Ask us anything — we’re here to help</Text>
        </View>
        <Pressable onPress={() => navigation.goBack()} style={styles.close} accessibilityLabel="Close chat">
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={messages.length ? styles.list : styles.emptyList}
        data={messages}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Say hello 👋</Text>
              <Text style={styles.emptyBody}>Your clinician will reply here.</Text>
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
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.slate50 },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.brand600, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 },
  headerTitle: { color: colors.white, fontSize: 16, fontWeight: '700' },
  headerSub: { color: colors.brand100, fontSize: 12, marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  closeText: { color: colors.white, fontSize: 16 },
  list: { padding: 16, gap: 8 },
  emptyList: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.slate700 },
  emptyBody: { fontSize: 13, color: colors.slate400, marginTop: 4 },
});
