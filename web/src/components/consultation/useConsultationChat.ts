'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { MY_CONVERSATION, SEND_MESSAGE } from '@/graphql/messaging';
import { realtime } from '@/lib/apollo';
import { useRealtimeConnected } from '@/lib/realtime';

export type ChatMessage = { id: string; senderId: string; senderRole: string; content: string; sentAt: string };

// While live updates aren't arriving, poll so the thread still moves.
const FALLBACK_POLL_MS = 10_000;
const OPEN_PREF_KEY = 'patient.chat.open';
const SEEN_KEY = 'patient.chat.seen';

// Unread state is per browser: the backend doesn't track who has read a message.
function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode etc. — the chat still works */ }
}

// The patient's one conversation with their care team. Messages are stored per consultation,
// so this merges them across all of them; replies go to the newest consultation, which is
// where the clinician's replies go too — so both sides see the same thread from any page.
export function useConversationChat({ currentUserId }: { currentUserId: string | null }) {
  const client = useApolloClient();
  const connected = useRealtimeConnected(realtime);
  const [open, setOpen] = useState(() => readStorage(OPEN_PREF_KEY) === '1');
  const [seenAt, setSeenAt] = useState(() => Number(readStorage(SEEN_KEY)) || 0);

  const { data, loading, refetch, startPolling, stopPolling } = useQuery(MY_CONVERSATION);
  const consultations: Array<{ id: string; messages: ChatMessage[] }> = data?.myConsultations ?? [];
  const messages: ChatMessage[] = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    consultations.forEach((c) => (c.messages ?? []).forEach((m) => byId.set(m.id, m)));
    return [...byId.values()].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  // Consultations come newest first.
  const replyTo = consultations[0]?.id;

  // The mutation's own result and the subscription can both deliver a message; add it once.
  const receive = (consultationId: string, message: ChatMessage) => {
    client.cache.updateQuery({ query: MY_CONVERSATION }, (existing) => {
      if (!existing) return existing;
      return {
        myConsultations: existing.myConsultations.map((c: any) =>
          c.id !== consultationId || c.messages.some((m: ChatMessage) => m.id === message.id)
            ? c
            : { ...c, messages: [...c.messages, message] },
        ),
      };
    });
  };

  useEffect(() => {
    if (connected) return;
    startPolling(FALLBACK_POLL_MS);
    return stopPolling;
  }, [connected, startPolling, stopPolling]);
  // Messages sent while the socket was down were never delivered to it.
  useEffect(() => realtime?.onReconnect(() => { refetch(); }), [refetch]);

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    onCompleted({ sendMessage: message }) { if (replyTo) receive(replyTo, message); },
  });

  const latestAt = messages.length ? new Date(messages[messages.length - 1].sentAt).getTime() : 0;
  const unread = useMemo(
    () => messages.filter((m) => m.senderId !== currentUserId && new Date(m.sentAt).getTime() > seenAt).length,
    [messages, currentUserId, seenAt],
  );

  // Looking at the thread marks everything up to the latest message as seen.
  useEffect(() => {
    if (open && latestAt > seenAt) {
      setSeenAt(latestAt);
      writeStorage(SEEN_KEY, String(latestAt));
    }
  }, [open, latestAt, seenAt]);

  const setOpenPersisted = (next: boolean) => {
    setOpen(next);
    writeStorage(OPEN_PREF_KEY, next ? '1' : '0');
  };

  const send = async (content: string) => {
    if (!replyTo) return;
    await sendMessage({ variables: { input: { consultationId: replyTo, content } } });
  };

  return {
    messages,
    loading,
    consultationIds: consultations.map((c) => c.id),
    receive,
    open,
    setOpen: setOpenPersisted,
    unread,
    sending,
    send,
  };
}
