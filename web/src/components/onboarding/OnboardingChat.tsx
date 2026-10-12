'use client';

import { createContext, useContext, useState } from 'react';
import { getToken, parseJwt } from '@/lib/auth';
import { ChatDock } from '@/components/consultation/ChatDock';
import { ConversationWatchers } from '@/components/consultation/ConversationWatchers';
import { useConversationChat } from '@/components/consultation/useConsultationChat';

const OpenChatContext = createContext<(draft?: string) => void>(() => undefined);

/** Opens the onboarding chat, optionally starting the message with `draft`. */
export const useOpenOnboardingChat = () => useContext(OpenChatContext);

// The care-team chat as a floating window, so a patient can ask for help
// mid-onboarding without leaving the step they're on — whether or not their
// onboarding is approved or they have a consultation yet.
export function OnboardingChatProvider({ children }: { children: React.ReactNode }) {
  const token = getToken();
  const currentUserId = token ? parseJwt(token)?.sub ?? null : null;
  const chat = useConversationChat({ currentUserId });
  const [draft, setDraft] = useState<string | undefined>();

  const openChat = (text?: string) => {
    setDraft(text);
    chat.setOpen(true);
  };

  return (
    <OpenChatContext.Provider value={openChat}>
      {children}
      <ChatDock
        variant="floating"
        open={chat.open}
        onOpenChange={chat.setOpen}
        messages={chat.messages}
        unread={chat.unread}
        currentUserId={currentUserId}
        sending={chat.sending}
        loading={chat.loading}
        onSend={chat.send}
        draft={draft}
      />
      <ConversationWatchers consultationIds={chat.consultationIds} onMessage={chat.receive} onRead={chat.receiveRead} />
    </OpenChatContext.Provider>
  );
}
