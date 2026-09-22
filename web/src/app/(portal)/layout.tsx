'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated, clearToken } from '@/lib/auth';

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
    <div className="flex h-screen bg-gray-100">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-200">
          <span className="text-sm font-semibold text-brand-900">Telehealth Portal</span>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          <Link
            href="/queue"
            className={`flex items-center px-3 py-2 text-sm rounded-md ${
              pathname === '/queue' ? 'bg-brand-50 text-brand-900 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Review Queue
          </Link>
        </nav>
        <div className="px-4 py-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
