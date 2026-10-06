'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { OnboardingChatProvider, useOpenOnboardingChat } from '@/components/onboarding/OnboardingChat';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) router.replace('/login');
  }, [router]);

  return (
    <OnboardingChatProvider>
      <div className="min-h-screen bg-slate-50">
        <header className="px-4 py-3 flex items-center justify-between border-b border-slate-100 bg-white">
          <span className="font-bold text-base text-slate-900 tracking-tight">telehealth</span>
          <MessageUsButton />
        </header>
        <main className="max-w-lg mx-auto px-4 py-6">{children}</main>
      </div>
    </OnboardingChatProvider>
  );
}

function MessageUsButton() {
  const openChat = useOpenOnboardingChat();
  return (
    <button
      type="button"
      onClick={() => openChat()}
      className="w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
      aria-label="Message us"
    >
      💬
    </button>
  );
}
