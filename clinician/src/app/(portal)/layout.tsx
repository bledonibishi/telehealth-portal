'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated, clearToken } from '@/lib/auth';
import { getCurrentRole, type ClinicianRole } from '@/lib/role';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  roles: ClinicianRole[]; // which roles can see this
};

const NAV: NavItem[] = [
  { href: '/leads',   label: 'Leads',          icon: '🎯', roles: ['ADMIN', 'CX_TEAM'] },
  { href: '/patients', label: 'Patients',       icon: '👥', roles: ['ADMIN', 'DOCTOR', 'CX_TEAM', 'PROVIDER'] },
  { href: '/queue',   label: 'Review queue',    icon: '📋', roles: ['ADMIN', 'DOCTOR'] },
  { href: '/orders',  label: 'Orders',          icon: '📦', roles: ['ADMIN', 'PROVIDER'] },
  { href: '/team',    label: 'Team & Roles',    icon: '🛡️', roles: ['ADMIN'] },
];

const ROLE_BADGE: Record<ClinicianRole, { label: string; cls: string }> = {
  ADMIN:    { label: 'Admin',    cls: 'bg-purple-100 text-purple-700' },
  DOCTOR:   { label: 'Doctor',   cls: 'bg-blue-100 text-blue-700' },
  CX_TEAM:  { label: 'CX Team',  cls: 'bg-teal-100 text-teal-700' },
  PROVIDER: { label: 'Provider', cls: 'bg-amber-100 text-amber-700' },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<ClinicianRole | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    setRole(getCurrentRole());
  }, [router]);

  const handleLogout = () => { clearToken(); router.replace('/login'); };

  const visibleNav = NAV.filter((item) => !role || item.roles.includes(role));
  const badge = role ? ROLE_BADGE[role] : null;

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-200">
          <span className="text-sm font-semibold text-brand-900">Telehealth Portal</span>
          {badge && (
            <span className={`mt-2 inline-block text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          )}
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {visibleNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-900 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>


      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 bg-white border-b border-gray-200 flex items-center justify-end px-6 shrink-0">
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 12H9m0 0l3-3m-3 3l3 3" />
            </svg>
            Sign out
          </button>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
