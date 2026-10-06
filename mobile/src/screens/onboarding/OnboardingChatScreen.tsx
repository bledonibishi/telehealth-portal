import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { MY_CONVERSATION, SEND_MESSAGE } from '../../graphql/operations';
import { colors } from '../../theme';

type Message = { id: string; senderId: string; senderRole: string; content: string; sentAt: string };

// How often to look for replies: the thread before a consultation has no live channel.
const POLL_MS = 10_000;

/**
 * The care-team chat during onboarding, opened as a sheet from the bottom of the screen. It works
 * before the patient has a consultation: those messages move onto the consultation once the medical
 * questionnaire is submitted (see ConsultationsService.submitIntakeQuiz).
 */
export function OnboardingChatScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState<string>(route?.params?.draft ?? '');
  const [me, setMe] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    SecureStore.getItemAsync('access_token').then((token) => {
      try {
        if (token) setMe(JSON.parse(atob(token.split('.')[1])).sub);
      } catch {
        /* no id: every message just shows on the team's side */
      }
    });
  }, []);

  const { data, loading, refetch } = useQuery(MY_CONVERSATION, { pollInterval: POLL_MS, fetchPolicy: 'cache-and-network' });
  const consultations: Array<{ id: string; messages: Message[] }> = data?.myConsultations ?? [];
  const messages = useMemo(() => {
    const byId = new Map<string, Message>();
    consultations.forEach((c) => (c.messages ?? []).forEach((m) => byId.set(m.id, m)));
    ((data?.myPreConsultationMessages ?? []) as Message[]).forEach((m) => byId.set(m.id, m));
    return [...byId.values()].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE);

  const send = async () => {
    const text = content.trim();
    if (!text || sending) return;
    setProblem('');
    // Consultations come newest first; with none, the server keeps it on the pre-consultation thread.
    const replyTo = consultations[0]?.id;
    try {
      await sendMessage({ variables: { input: replyTo ? { consultationId: replyTo, content: text } : { content: text } } });
      setContent('');
      await refetch();
    } catch (err: any) {
      setProblem(err?.message ?? 'Couldn’t send that. Please try again.');
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
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Say hello 👋</Text>
              <Text style={styles.emptyBody}>Your clinician will reply here.</Text>
            </View>
          )
        }
        renderItem={({ item: m }) => {
          const mine = m.senderId === me || (m.senderRole === 'PATIENT' && !me);
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[styles.bubbleText, mine && { color: colors.white }]}>{m.content}</Text>
              <Text style={[styles.time, mine && { color: colors.brand100 }]}>
                {new Date(m.sentAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {!!problem && <Text style={styles.problem}>{problem}</Text>}
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={content} onChangeText={setContent} placeholder="Write a message…" multiline maxLength={2000} />
          <Pressable onPress={send} disabled={!content.trim() || sending} style={[styles.send, (!content.trim() || sending) && { opacity: 0.4 }]}>
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
        <Text style={styles.note}>In a medical emergency, call your local emergency number instead of using chat.</Text>
      </View>
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
  bubble: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brand600, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate100, borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: 15, color: colors.slate900, lineHeight: 20 },
  time: { fontSize: 10, color: colors.slate400, marginTop: 3, alignSelf: 'flex-end' },
  composer: { borderTopWidth: 1, borderTopColor: colors.slate100, backgroundColor: colors.white, paddingHorizontal: 12, paddingTop: 10 },
  problem: { color: colors.danger, fontSize: 12, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.slate200, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, maxHeight: 120 },
  send: { backgroundColor: colors.brand600, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 },
  sendText: { color: colors.white, fontWeight: '600' },
  note: { fontSize: 11, color: colors.slate400, marginTop: 8, textAlign: 'center' },
});
