'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUnreadMessages } from '@/lib/useUnreadMessages';
import { Icon, type IconName } from './Icon';

type Item = { href: string; label: string; icon: IconName; badge?: boolean };

/**
 * Phones and tablets: the four places a patient goes most, always one tap away at the bottom of the screen, and "More" for
 * the full menu. Hidden from laptop width up, where the sidebar is always shown.
 */
export function BottomNav({ dosesLabel, dosesIcon, onMore }: { dosesLabel: string; dosesIcon: IconName; onMore: () => void }) {
  const pathname = usePathname();
  const { unread } = useUnreadMessages();
  const items: Item[] = [
    { href: '/dashboard', label: 'Home', icon: 'home' },
    { href: '/treatment-plan', label: 'Treatment', icon: 'plan' },
    { href: '/doses', label: dosesLabel === 'Injections' ? 'Injections' : 'Doses', icon: dosesIcon },
    { href: '/messages', label: 'Messages', icon: 'chat', badge: true },
  ];
  const cell = 'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors';
  return (
    <nav aria-label="Main" className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
      <div className="flex">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + '/');
          return (
            <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined} className={`${cell} ${active ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800'}`}>
              <span className={`relative flex items-center justify-center w-12 h-7 rounded-full ${active ? 'bg-brand-50' : ''}`}>
                <Icon name={it.icon} className="w-5 h-5" />
                {it.badge && unread > 0 && (
                  <span className="absolute -top-1 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-600 text-white text-[10px] font-semibold flex items-center justify-center">{unread}</span>
                )}
              </span>
              {it.label}
            </Link>
          );
        })}
        <button type="button" onClick={onMore} className={`${cell} text-slate-500 hover:text-slate-800`}>
          <span className="flex items-center justify-center w-12 h-7"><Icon name="menu" className="w-5 h-5" /></span>
          More
        </button>
      </div>
    </nav>
  );
}
