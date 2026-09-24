'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated, clearToken } from '@/lib/auth';

const NAV = [
  { href: '/dashboard', label: 'My consultations', icon: '📋' },
  { href: '/messages', label: 'Messages', icon: '💬' },
  { href: '/prescription', label: 'Prescriptions', icon: '💊' },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated()) router.replace('/login');
  }, [router]);

  const handleLogout = () => {
    clearToken();
    router.replace('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-60 bg-white border-r border-slate-100 flex flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-slate-100">
          <span className="font-bold text-lg text-slate-900 tracking-tight">telehealth</span>
          <p className="text-xs text-slate-400 mt-0.5">Patient portal</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-slate-100">
          <button
            onClick={handleLogout}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
