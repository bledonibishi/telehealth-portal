'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUnreadMessages } from '@/lib/useUnreadMessages';
import { Icon, Logo, type IconName } from './Icon';

export type NavItem = { href: string; label: string; icon: IconName; badge?: 'messages' };

export const BRAND = { name: 'telehealth', tagline: 'Better health. A brighter you.' };

export function Sidebar({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { unread } = useUnreadMessages();
  return (
    <div className="h-full flex flex-col bg-ink-950 text-white">
      <div className="px-5 pt-6 pb-8 flex items-center gap-3">
        <Logo className="w-10 h-10 text-white" />
        <div>
          <p className="text-lg font-semibold leading-tight tracking-tight">{BRAND.name}</p>
          <p className="text-[10px] text-white/60 whitespace-nowrap">{BRAND.tagline}</p>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto" aria-label="Main">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const count = item.badge === 'messages' ? unread : 0;
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-sm transition-colors ${active ? 'bg-ink-700 text-white font-medium shadow-inner' : 'text-white/80 hover:bg-white/5 hover:text-white'}`}>
              <Icon name={item.icon} className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {count > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">{count}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4">
        <Link href="/messages" onClick={onNavigate} className="flex items-center gap-3 rounded-2xl bg-white/5 hover:bg-white/10 p-4">
          <span className="w-10 h-10 rounded-full bg-ink-700 flex items-center justify-center flex-shrink-0"><Icon name="chat" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Need help?</span>
            <span className="block text-xs text-white/70">Chat with your doctor</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
