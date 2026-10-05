'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@apollo/client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated, clearToken } from '@/lib/auth';
import { getCurrentRole, type ClinicianRole } from '@/lib/role';
import { NotificationBell } from '@/components/NotificationBell';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { GET_NOTIFICATION_COUNTS } from '@/graphql/notifications';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  roles: ClinicianRole[];
  badgeKey?: keyof NotifCounts;
};

type NotifCounts = {
  newLeads: number;
  pendingConsultations: number;
  patientMessages: number;
  pendingOrders: number;
  shipmentsDue: number;
  urgentAppointments: number;
};

const NAV: NavItem[] = [
  { href: '/',         label: 'Dashboard',     icon: '📊', roles: ['ADMIN'] },
  { href: '/leads',    label: 'Leads',         icon: '🎯', roles: ['ADMIN', 'CX_TEAM'],                               badgeKey: 'newLeads' },
  { href: '/patients', label: 'Patients',       icon: '👥', roles: ['ADMIN', 'DOCTOR', 'CX_TEAM', 'PROVIDER'],         badgeKey: 'patientMessages' },
  { href: '/queue',    label: 'Review queue',   icon: '📋', roles: ['ADMIN', 'DOCTOR'],                                badgeKey: 'pendingConsultations' },
  { href: '/check-ins', label: 'Check-ins',     icon: '🩺', roles: ['ADMIN', 'DOCTOR'] },
  { href: '/appointments', label: 'Appointments', icon: '📅', roles: ['ADMIN', 'DOCTOR'],                            badgeKey: 'urgentAppointments' },
  { href: '/labs',     label: 'Labs',           icon: '🧪', roles: ['ADMIN', 'DOCTOR'] },
  { href: '/orders',   label: 'Orders',         icon: '📦', roles: ['ADMIN', 'PROVIDER'],                              badgeKey: 'pendingOrders' },
  { href: '/shipments', label: 'Next shipments', icon: '🚚', roles: ['ADMIN', 'DOCTOR', 'PROVIDER'],                    badgeKey: 'shipmentsDue' },
  { href: '/team',     label: 'Team & Roles',   icon: '🛡️', roles: ['ADMIN'] },
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
  const { t, ready } = useI18n();
  const [role, setRole] = useState<ClinicianRole | null>(null);
  // Hold back the pages until the browser confirms a token, so their queries never run
  // during server rendering or before the redirect to /login.
  const [authChecked, setAuthChecked] = useState(false);

  const { data } = useQuery(GET_NOTIFICATION_COUNTS, { pollInterval: 30_000, skip: !role });
  const counts: NotifCounts = data?.notificationCounts ?? {
    newLeads: 0, pendingConsultations: 0, patientMessages: 0, pendingOrders: 0, shipmentsDue: 0, urgentAppointments: 0,
  };

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    setRole(getCurrentRole());
    setAuthChecked(true);
  }, [router]);

  const handleLogout = () => { clearToken(); router.replace('/login'); };

  const visibleNav = NAV.filter((item) => !role || item.roles.includes(role));
  const badge = role ? ROLE_BADGE[role] : null;

  return (
    <div style={ready ? undefined : { visibility: 'hidden' }} className="dark-surface flex h-screen bg-[color:var(--bg-page)] text-[color:var(--t-body)]">
      <aside className="w-56 shrink-0 border-r flex flex-col bg-[color:var(--bg-panel)] border-[color:var(--border-subtle)]">
        <div className="px-4 py-5 border-b border-[color:var(--border-subtle)] flex flex-col items-start gap-2">
          <span className="text-sm font-semibold text-[color:var(--t-strong)]">{t('Telehealth Portal')}</span>
          {badge && (
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${badge.cls}`}>
              {t(badge.label)}
            </span>
          )}
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {visibleNav.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(item.href + '/');
            const badgeCount = item.badgeKey ? counts[item.badgeKey] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors ${
                  active
                    ? 'bg-brand-500 text-white font-medium'
                    : 'text-[color:var(--t-muted)] hover:bg-[color:var(--bg-card)] hover:text-[color:var(--t-strong)]'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{t(item.label)}</span>
                {badgeCount > 0 && (
                  <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 border-b flex items-center justify-between px-6 shrink-0 bg-[color:var(--bg-panel)] border-[color:var(--border-subtle)]">
          <div /> {/* spacer */}
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
            <NotificationBell />
            <div className="w-px h-5 bg-[color:var(--border)]" />
            <button
              onClick={handleLogout}
              className="text-sm flex items-center gap-1.5 text-[color:var(--t-muted)] hover:text-[color:var(--t-strong)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 12H9m0 0l3-3m-3 3l3 3" />
              </svg>
              {t('Sign out')}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{authChecked ? children : null}</main>
      </div>
    </div>
  );
}
