'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApolloClient } from '@apollo/client';
import { clearToken, isAuthenticated } from '@/lib/auth';
import { Icon, Logo } from '@/components/portal/Icon';
import { OnboardingChatProvider, useOpenOnboardingChat } from '@/components/onboarding/OnboardingChat';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const apollo = useApolloClient();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const onHub = pathname === '/onboarding';

  useEffect(() => {
    if (!isAuthenticated()) router.replace('/login');
  }, [router]);

  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const logOut = () => {
    clearToken();
    // Patient-scoped queries are cached without the patient in their key.
    apollo.clearStore();
    router.replace('/login');
  };

  const item = 'w-full flex items-center gap-3 px-3.5 py-3 text-sm text-left text-ink-900 hover:bg-slate-50 rounded-md';

  return (
    <OnboardingChatProvider>
      <div className="min-h-screen bg-slate-50">
        <header className="h-14 px-4 flex items-center justify-between border-b border-slate-100 bg-white">
          <Link href="/onboarding" className="flex items-center gap-2 text-ink-900"><Logo className="w-7 h-7" /><span className="font-bold text-base tracking-tight">telehealth</span></Link>
          <div className="flex items-center gap-2">
            <MessageUsButton />
            <div ref={menuRef} className="relative">
              <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu" className="h-9 pl-3 pr-2.5 flex items-center gap-1.5 rounded-full border border-slate-200 text-sm font-medium text-ink-800 hover:bg-slate-50">
                Menu <Icon name="chevron" className="w-4 h-4" />
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 mt-2 w-64 bg-white rounded-lg border border-slate-200 shadow-xl z-40 p-1.5">
                  {!onHub && (
                    <Link href="/onboarding" role="menuitem" className={item}>
                      <Icon name="check" className="w-4 h-4 text-emerald-600" />
                      <span><b className="block font-semibold">Save &amp; back to my steps</b><span className="block text-xs text-slate-500">Everything so far is kept</span></span>
                    </Link>
                  )}
                  <button type="button" role="menuitem" onClick={logOut} className={item}>
                    <Icon name="logout" className="w-4 h-4 text-slate-500" />
                    <span><b className="block font-semibold">Log out</b><span className="block text-xs text-slate-500">Pick up where you left off next time</span></span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-6">{children}</main>
      </div>
    </OnboardingChatProvider>
  );
}

// Opens the chat over the current step instead of leaving onboarding.
function MessageUsButton() {
  const openChat = useOpenOnboardingChat();
  return (
    <button
      type="button"
      onClick={() => openChat()}
      className="w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 text-ink-700 hover:bg-slate-50"
      aria-label="Message us"
    >
      <Icon name="chat" className="w-[18px] h-[18px]" />
    </button>
  );
}
