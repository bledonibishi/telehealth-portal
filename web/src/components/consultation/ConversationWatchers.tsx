'use client';

import { useSubscription } from '@apollo/client';
import { MESSAGES_READ_SUBSCRIPTION, NEW_MESSAGE_SUBSCRIPTION } from '@/graphql/messaging';

// Same file lives in web/src/components/consultation and clinician/src/components/consultation.

type Message = { id: string; senderId: string; senderRole: string; content: string; sentAt: string; readAt?: string | null };
export type ReadReceipt = { consultationId: string; byPatient: boolean; readAt: string };

function Watcher({ consultationId, onMessage, onRead }: {
  consultationId: string;
  onMessage: (consultationId: string, message: Message) => void;
  onRead?: (receipt: ReadReceipt) => void;
}) {
  useSubscription(NEW_MESSAGE_SUBSCRIPTION, {
    variables: { consultationId },
    onData({ data: { data } }) {
      if (data?.newMessage) onMessage(consultationId, data.newMessage);
    },
  });
  // The other side opened the conversation: our messages there are now read.
  useSubscription(MESSAGES_READ_SUBSCRIPTION, {
    variables: { consultationId },
    skip: !onRead,
    onData({ data: { data } }) {
      if (data?.messagesRead) onRead?.(data.messagesRead);
    },
  });
  return null;
}

// Messages are stored per consultation, so listen to every consultation in the conversation.
export function ConversationWatchers({
  consultationIds, onMessage, onRead,
}: {
  consultationIds: string[];
  onMessage: (consultationId: string, message: Message) => void;
  onRead?: (receipt: ReadReceipt) => void;
}) {
  return (
    <>
      {consultationIds.map((id) => <Watcher key={id} consultationId={id} onMessage={onMessage} onRead={onRead} />)}
    </>
  );
}
