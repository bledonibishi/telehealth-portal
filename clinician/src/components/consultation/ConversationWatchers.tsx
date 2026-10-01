'use client';

import { useSubscription } from '@apollo/client';
import { NEW_MESSAGE_SUBSCRIPTION } from '@/graphql/messaging';

// Same file lives in web/src/components/consultation and clinician/src/components/consultation.

type Message = { id: string; senderId: string; senderRole: string; content: string; sentAt: string };

function Watcher({ consultationId, onMessage }: { consultationId: string; onMessage: (consultationId: string, message: Message) => void }) {
  useSubscription(NEW_MESSAGE_SUBSCRIPTION, {
    variables: { consultationId },
    onData({ data: { data } }) {
      if (data?.newMessage) onMessage(consultationId, data.newMessage);
    },
  });
  return null;
}

// Messages are stored per consultation, so listen to every consultation in the conversation.
export function ConversationWatchers({
  consultationIds, onMessage,
}: {
  consultationIds: string[];
  onMessage: (consultationId: string, message: Message) => void;
}) {
  return (
    <>
      {consultationIds.map((id) => <Watcher key={id} consultationId={id} onMessage={onMessage} />)}
    </>
  );
}
