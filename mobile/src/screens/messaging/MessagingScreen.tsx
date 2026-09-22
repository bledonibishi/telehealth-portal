import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useQuery, useMutation, useSubscription } from '@apollo/client';
import * as SecureStore from 'expo-secure-store';
import { GET_MY_CONSULTATION, SEND_MESSAGE, NEW_MESSAGE_SUBSCRIPTION } from '../../graphql/operations';

export function MessagingScreen({ route }: any) {
  const consultationId = route?.params?.consultationId;
  const [content, setContent] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    SecureStore.getItemAsync('access_token').then((token) => {
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setCurrentUserId(payload.sub);
        } catch {}
      }
    });
  }, []);

  const { data } = useQuery(GET_MY_CONSULTATION, {
    variables: { id: consultationId },
    skip: !consultationId,
  });

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    onCompleted() { setContent(''); },
  });

  useSubscription(NEW_MESSAGE_SUBSCRIPTION, {
    variables: { consultationId },
    skip: !consultationId,
    onData({ client, data: { data: subData } }) {
      client.cache.modify({
        fields: {
          messages(existing = []) {
            return [...existing, subData.newMessage];
          },
        },
      });
    },
  });

  const messages = data?.consultation?.messages ?? [];

  if (!consultationId) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Select a consultation to view messages.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m: any) => m.id}
        onContentSizeChange={() => listRef.current?.scrollToEnd()}
        renderItem={({ item: m }: any) => {
          const isMe = m.senderId === currentUserId;
          return (
            <View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
              <Text style={[styles.bubbleText, isMe && styles.myText]}>{m.content}</Text>
              <Text style={[styles.meta, isMe && styles.myMeta]}>
                {m.senderRole} · {new Date(m.sentAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={content}
          onChangeText={setContent}
          placeholder="Type a message…"
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!content.trim() || sending) && styles.sendDisabled]}
          disabled={!content.trim() || sending}
          onPress={() => sendMessage({ variables: { input: { consultationId, content: content.trim() } } })}
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#9ca3af', fontSize: 14 },
  bubble: { margin: 8, maxWidth: '75%', borderRadius: 12, padding: 10 },
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#0ea5e9' },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#e5e7eb' },
  bubbleText: { fontSize: 15, color: '#111827' },
  myText: { color: '#fff' },
  meta: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  myMeta: { color: '#bae6fd' },
  inputRow: { flexDirection: 'row', padding: 8, borderTopWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'flex-end' },
  input: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, maxHeight: 100 },
  sendBtn: { marginLeft: 8, backgroundColor: '#0ea5e9', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
