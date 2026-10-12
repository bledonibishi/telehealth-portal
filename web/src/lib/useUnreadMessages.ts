'use client';

import { useQuery } from '@apollo/client';
import { MY_CONVERSATION } from '@/graphql/messaging';

type Message = { id: string; senderRole: string; content: string; sentAt: string; readAt?: string | null };

/**
 * Messages from the care team the patient hasn't read yet — as the server knows it, so the count is the
 * same on every device and clears everywhere the moment the chat is opened anywhere.
 */
export function useUnreadMessages() {
  const { data } = useQuery(MY_CONVERSATION, { fetchPolicy: 'cache-and-network', pollInterval: 60_000 });
  const messages: Message[] = (data?.myConsultations ?? []).flatMap((c: any) => c.messages ?? []);
  const unread = messages.filter((m) => m.senderRole !== 'PATIENT' && !m.readAt).length;
  const latest = messages.length ? messages.reduce((a, b) => (Date.parse(b.sentAt) > Date.parse(a.sentAt) ? b : a)) : null;
  return { unread, latest, messages };
}
