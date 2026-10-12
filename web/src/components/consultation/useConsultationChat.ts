'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { MARK_MESSAGES_READ, MARK_PRE_CONSULTATION_READ, MY_CONVERSATION, SEND_MESSAGE } from '@/graphql/messaging';
import { realtime } from '@/lib/apollo';
import { useRealtimeConnected } from '@/lib/realtime';
import type { ReadReceipt } from './ConversationWatchers';

export type ChatMessage = {
  id: string;
  senderId: string;
  senderRole: string;
  content: string;
  sentAt: string;
  /** When the other side read it; null until they have. */
  readAt?: string | null;
  /** Still on its way to the server (shown with a single tick). */
  pending?: boolean;
};

// While live updates aren't arriving, poll so the thread still moves.
const FALLBACK_POLL_MS = 10_000;
const OPEN_PREF_KEY = 'patient.chat.open';

function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode etc. — the chat still works */ }
}

const fromTeam = (m: ChatMessage) => m.senderRole !== 'PATIENT';

// The patient's one conversation with their care team. Messages are stored per consultation,
// so this merges them across all of them; replies go to the newest consultation, which is
// where the clinician's replies go too — so both sides see the same thread from any page.
// A patient with no consultation yet writes to their pre-consultation thread, which moves onto
// the consultation once the medical questionnaire is submitted.
export function useConversationChat({ currentUserId }: { currentUserId: string | null }) {
  const client = useApolloClient();
  const connected = useRealtimeConnected(realtime);
  const [open, setOpen] = useState(() => readStorage(OPEN_PREF_KEY) === '1');
  // Messages typed and not yet confirmed by the server, so they show at once with a single tick.
  const [pending, setPending] = useState<ChatMessage[]>([]);

  const { data, loading, refetch, startPolling, stopPolling } = useQuery(MY_CONVERSATION);
  const consultations: Array<{ id: string; messages: ChatMessage[] }> = data?.myConsultations ?? [];
  const preConsultation: ChatMessage[] = data?.myPreConsultationMessages ?? [];
  const saved: ChatMessage[] = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    consultations.forEach((c) => (c.messages ?? []).forEach((m) => byId.set(m.id, m)));
    preConsultation.forEach((m) => byId.set(m.id, m));
    return [...byId.values()].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const messages = useMemo(() => [...saved, ...pending], [saved, pending]);
  // Consultations come newest first.
  const replyTo = consultations[0]?.id;

  const patch = useCallback(
    (change: (c: { id: string; messages: ChatMessage[] }) => { id: string; messages: ChatMessage[] }) => {
      client.cache.updateQuery({ query: MY_CONVERSATION }, (existing) => (existing ? { ...existing, myConsultations: existing.myConsultations.map(change) } : existing));
    },
    [client],
  );
  const patchPre = useCallback(
    (change: (messages: ChatMessage[]) => ChatMessage[]) => {
      client.cache.updateQuery({ query: MY_CONVERSATION }, (existing) =>
        existing ? { ...existing, myPreConsultationMessages: change(existing.myPreConsultationMessages ?? []) } : existing,
      );
    },
    [client],
  );

  // The mutation's own result and the subscription can both deliver a message; add it once.
  const receive = useCallback(
    (consultationId: string, message: ChatMessage) => {
      patch((c) => (c.id !== consultationId || c.messages.some((m) => m.id === message.id) ? c : { ...c, messages: [...c.messages, { readAt: null, ...message }] }));
    },
    [patch],
  );

  /** The care team opened the conversation: everything the patient sent there is now read. */
  const receiveRead = useCallback(
    (receipt: ReadReceipt) => {
      if (receipt.byPatient) return;
      patch((c) => (c.id !== receipt.consultationId ? c : { ...c, messages: c.messages.map((m) => (fromTeam(m) || m.readAt ? m : { ...m, readAt: receipt.readAt })) }));
    },
    [patch],
  );

  // The pre-consultation thread has no live channel, so it is always polled.
  const live = connected && consultations.length > 0;
  useEffect(() => {
    if (live) return;
    startPolling(FALLBACK_POLL_MS);
    return stopPolling;
  }, [live, startPolling, stopPolling]);
  // Messages sent while the socket was down were never delivered to it.
  useEffect(() => realtime?.onReconnect(() => { refetch(); }), [refetch]);

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE);
  const [markRead] = useMutation(MARK_MESSAGES_READ);
  const [markPreRead] = useMutation(MARK_PRE_CONSULTATION_READ);

  const unread = useMemo(() => saved.filter((m) => fromTeam(m) && !m.readAt).length, [saved]);

  // Looking at the thread reads it: tell the server (so the care team sees it was read, on any device) and
  // mark it here straight away. One request per consultation that has something unread, never repeated.
  const marking = useRef(new Set<string>());
  useEffect(() => {
    if (!open) return;
    for (const c of consultations) {
      if (marking.current.has(c.id) || !(c.messages ?? []).some((m) => fromTeam(m) && !m.readAt)) continue;
      marking.current.add(c.id);
      const readAt = new Date().toISOString();
      markRead({ variables: { consultationId: c.id } })
        .then(() => patch((x) => (x.id !== c.id ? x : { ...x, messages: x.messages.map((m) => (fromTeam(m) && !m.readAt ? { ...m, readAt } : m)) })))
        .catch(() => undefined) // still unread on the server; tried again next time the thread is opened
        .finally(() => marking.current.delete(c.id));
    }
    if (!marking.current.has('pre') && preConsultation.some((m) => fromTeam(m) && !m.readAt)) {
      marking.current.add('pre');
      const readAt = new Date().toISOString();
      markPreRead()
        .then(() => patchPre((ms) => ms.map((m) => (fromTeam(m) && !m.readAt ? { ...m, readAt } : m))))
        .catch(() => undefined)
        .finally(() => marking.current.delete('pre'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  const setOpenPersisted = (next: boolean) => {
    setOpen(next);
    writeStorage(OPEN_PREF_KEY, next ? '1' : '0');
  };

  const send = async (content: string) => {
    const temp: ChatMessage = { id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`, senderId: currentUserId ?? '', senderRole: 'PATIENT', content, sentAt: new Date().toISOString(), pending: true };
    setPending((p) => [...p, temp]);
    try {
      if (replyTo) {
        const res = await sendMessage({ variables: { input: { consultationId: replyTo, content } } });
        if (res.data?.sendMessage) receive(replyTo, res.data.sendMessage);
      } else {
        const res = await sendMessage({ variables: { input: { content } } });
        const saved = res.data?.sendMessage;
        if (saved) patchPre((ms) => (ms.some((m) => m.id === saved.id) ? ms : [...ms, { readAt: null, ...saved }]));
      }
    } finally {
      // Gone either way: replaced by the saved message, or dropped so the caller can show the error.
      setPending((p) => p.filter((m) => m.id !== temp.id));
    }
  };

  return {
    messages,
    loading,
    consultationIds: consultations.map((c) => c.id),
    receive,
    receiveRead,
    open,
    setOpen: setOpenPersisted,
    unread,
    sending,
    send,
  };
}
