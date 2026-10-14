import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import * as SecureStore from 'expo-secure-store';
import { MARK_MESSAGES_READ, MARK_PRE_CONSULTATION_READ, MY_CONVERSATION, SEND_MESSAGE } from '../graphql/operations';

export type ChatAttachment = { id: string; filename: string; mimeType: string };
export type ChatMessage = {
  id: string;
  senderId: string;
  senderRole: string;
  /** Written by the automated support assistant, not a person. */
  isAi?: boolean;
  content: string;
  attachments?: ChatAttachment[];
  sentAt: string;
  readAt?: string | null;
};

const unreadFromTeam = (ms: ChatMessage[] | undefined) => (ms ?? []).some((m) => m.senderRole !== 'PATIENT' && !m.readAt);

// How often to look for replies: the thread before a consultation has no live channel.
const POLL_MS = 10_000;

/**
 * The patient's one conversation with their care team: the messages on each of their consultations, plus those from before
 * they had one, merged oldest first. Replies go to the newest consultation (the server keeps a message on the
 * pre-consultation thread when there is none). While `active` is true the conversation is open on screen, so what arrives is
 * marked read.
 */
export function useConversation({ active = true }: { active?: boolean } = {}) {
  const [me, setMe] = useState<string | null>(null);
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
  const consultations: Array<{ id: string; messages: ChatMessage[] }> = data?.myConsultations ?? [];
  const messages = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    consultations.forEach((c) => (c.messages ?? []).forEach((m) => byId.set(m.id, m)));
    ((data?.myPreConsultationMessages ?? []) as ChatMessage[]).forEach((m) => byId.set(m.id, m));
    return [...byId.values()].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE);
  const [markRead] = useMutation(MARK_MESSAGES_READ);
  const [markPreRead] = useMutation(MARK_PRE_CONSULTATION_READ);

  // Once per thread with something unread (a failure is tried again on the next poll).
  const marking = useRef(new Set<string>());
  useEffect(() => {
    if (!active) return;
    const mark = (key: string, run: () => Promise<unknown>) => {
      if (marking.current.has(key)) return;
      marking.current.add(key);
      run()
        .then(() => refetch())
        .catch(() => undefined)
        .finally(() => marking.current.delete(key));
    };
    consultations.forEach((c) => unreadFromTeam(c.messages) && mark(c.id, () => markRead({ variables: { consultationId: c.id } })));
    if (unreadFromTeam(data?.myPreConsultationMessages)) mark('pre', () => markPreRead());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, active]);

  /** Sends a message, with the ids of files already uploaded as SUPPORT_ATTACHMENT. Throws if it could not be sent. */
  const send = async (text: string, attachmentIds: string[] = []) => {
    const replyTo = consultations[0]?.id; // newest first
    const input = { ...(replyTo ? { consultationId: replyTo } : {}), content: text, ...(attachmentIds.length ? { attachmentIds } : {}) };
    await sendMessage({ variables: { input } });
    await refetch();
  };

  return { messages, me, loading, sending, send };
}

/** How many of the care team's messages the patient has not read yet: for the badge on the Messages tab. */
export function useUnreadMessageCount(): number {
  const { data } = useQuery(MY_CONVERSATION, { pollInterval: 30_000, fetchPolicy: 'cache-and-network' });
  const count = (ms: ChatMessage[] | undefined) => (ms ?? []).filter((m) => m.senderRole !== 'PATIENT' && !m.readAt).length;
  return (data?.myConsultations ?? []).reduce((n: number, c: { messages: ChatMessage[] }) => n + count(c.messages), 0) + count(data?.myPreConsultationMessages);
}
