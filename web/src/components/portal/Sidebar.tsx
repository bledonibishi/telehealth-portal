'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUnreadMessages } from '@/lib/useUnreadMessages';
import { Icon, Logo, type IconName } from './Icon';

export type NavItem = { href: string; label: string; icon: IconName; badge?: 'messages' };

export const BRAND = { name: 'Omopharmacy' };

// Flat and quiet, like the sign-in screen's teal: a light rail, hairline borders, small grouped links.
const GROUPS: { title: string; hrefs: string[] }[] = [
  { title: 'Overview', hrefs: ['/dashboard'] },
  { title: 'Treatment', hrefs: ['/treatment-plan', '/weight-journey', '/doses', '/symptoms'] },
  { title: 'Care', hrefs: ['/appointments', '/messages', '/care-team'] },
  { title: 'Account', hrefs: ['/orders', '/prescription', '/documents'] },
];

export function Sidebar({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { unread } = useUnreadMessages();
  const groups = GROUPS.map((g) => ({ title: g.title, items: g.hrefs.map((h) => items.find((i) => i.href === h)).filter((i): i is NavItem => !!i) }));
  // Anything not placed in a group still shows, so a new page never goes missing from the menu.
  const placed = new Set(GROUPS.flatMap((g) => g.hrefs));
  const rest = items.filter((i) => !placed.has(i.href));
  if (rest.length) groups.push({ title: 'More', items: rest });

  return (
    <div className="h-full flex flex-col bg-[#fbfbf9] text-slate-700 border-r border-slate-200/80">
      <div className="px-4 h-14 flex items-center gap-2.5 border-b border-slate-200/80">
        <span className="w-7 h-7 rounded-md bg-brand-700 text-white flex items-center justify-center flex-shrink-0"><Logo className="w-5 h-5" /></span>
        <p className="text-[15px] font-semibold tracking-tight text-slate-900">{BRAND.name}</p>
      </div>

      <nav className="flex-1 px-2.5 py-3 overflow-y-auto" aria-label="Main">
        {groups.filter((g) => g.items.length).map((g) => (
          <div key={g.title} className="mb-4">
            <p className="px-2.5 mb-1 text-[11px] font-medium text-slate-400">{g.title}</p>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                const count = item.badge === 'messages' ? unread : 0;
                return (
                  <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                    className={`group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] border transition-colors ${active ? 'bg-white border-slate-200 text-slate-900 font-medium shadow-[0_1px_0_rgba(15,23,42,0.04)]' : 'border-transparent text-slate-600 hover:bg-slate-900/[0.04] hover:text-slate-900'}`}>
                    <Icon name={item.icon} className={`w-4 h-4 flex-shrink-0 ${active ? 'text-brand-700' : 'text-slate-400 group-hover:text-slate-600'}`} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {count > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-700 text-white text-[10px] font-semibold flex items-center justify-center">{count}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-2.5 border-t border-slate-200/80">
        <Link href="/messages" onClick={onNavigate} className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white hover:border-slate-300 px-3 py-2.5 transition-colors">
          <span className="w-7 h-7 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center flex-shrink-0"><Icon name="chat" className="w-4 h-4" /></span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-slate-900">Need help?</span>
            <span className="block text-[11px] text-slate-500">Chat with your doctor</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
