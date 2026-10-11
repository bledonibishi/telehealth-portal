'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@apollo/client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated, clearToken } from '@/lib/auth';
import { getCurrentRole, type ClinicianRole } from '@/lib/role';
import { NotificationBell } from '@/components/NotificationBell';
import { NavIcon, type NavIconName } from '@/components/NavIcon';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { GET_NOTIFICATION_COUNTS } from '@/graphql/notifications';

type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  group: string;
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
  { href: '/',         label: 'Dashboard',     icon: 'home',     group: 'Overview', roles: ['ADMIN'] },
  { href: '/leads',    label: 'Leads',         icon: 'flag',     group: 'Clinical', roles: ['ADMIN', 'CX_TEAM'],                               badgeKey: 'newLeads' },
  { href: '/patients', label: 'Patients',       icon: 'user',     group: 'Clinical', roles: ['ADMIN', 'DOCTOR', 'CX_TEAM'],                     badgeKey: 'patientMessages' },
  { href: '/queue',    label: 'Review queue',   icon: 'plan',     group: 'Clinical', roles: ['ADMIN', 'DOCTOR'],                                badgeKey: 'pendingConsultations' },
  { href: '/check-ins', label: 'Check-ins',     icon: 'heart',    group: 'Clinical', roles: ['ADMIN', 'DOCTOR'] },
  { href: '/appointments', label: 'Appointments', icon: 'calendar', group: 'Clinical', roles: ['ADMIN', 'DOCTOR'],                          badgeKey: 'urgentAppointments' },
  { href: '/labs',     label: 'Labs',           icon: 'flask',    group: 'Clinical', roles: ['ADMIN', 'DOCTOR'] },
  { href: '/orders',   label: 'Orders',         icon: 'cart',     group: 'Fulfilment', roles: ['ADMIN', 'PROVIDER'],                            badgeKey: 'pendingOrders' },
  { href: '/shipments', label: 'Next shipments', icon: 'truck',    group: 'Fulfilment', roles: ['ADMIN', 'DOCTOR'],                              badgeKey: 'shipmentsDue' },
  { href: '/team',     label: 'Team & Roles',   icon: 'shield',   group: 'Admin', roles: ['ADMIN'] },
  { href: '/reports',  label: 'Monthly report', icon: 'chart',    group: 'Admin', roles: ['ADMIN'] },
  { href: '/audit',    label: 'Audit log',      icon: 'search',   group: 'Admin', roles: ['ADMIN'] },
];

const ROLE_BADGE: Record<ClinicianRole, { label: string; cls: string }> = {
  ADMIN:    { label: 'Admin',    cls: 'bg-purple-100 text-purple-700' },
  DOCTOR:   { label: 'Doctor',   cls: 'bg-sky-100 text-sky-700' },
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
  // Below lg the menu is a drawer over the page, opened from the header.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

  const { data } = useQuery(GET_NOTIFICATION_COUNTS, { pollInterval: 30_000, skip: !role });
  const raw: NotifCounts & { orderProblems?: number; refundRequests?: number } = data?.notificationCounts ?? {
    newLeads: 0, pendingConsultations: 0, patientMessages: 0, pendingOrders: 0, shipmentsDue: 0, urgentAppointments: 0,
  };
  // Orders needing attention (admin only) add to the Orders badge.
  const counts: NotifCounts = { ...raw, pendingOrders: raw.pendingOrders + (raw.orderProblems ?? 0) + (raw.refundRequests ?? 0) };

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    setRole(getCurrentRole());
    setAuthChecked(true);
  }, [router]);

  // The pharmacy partner has one page. If it lands on another (a bookmark, a typed address), send it back:
  // the server refuses it patient data anyway, this just spares it an error screen.
  useEffect(() => {
    if (role === 'PROVIDER' && !pathname.startsWith('/orders')) router.replace('/orders');
  }, [role, pathname, router]);

  const handleLogout = () => { clearToken(); router.replace('/login'); };

  const visibleNav = NAV.filter((item) => !role || item.roles.includes(role));
  const badge = role ? ROLE_BADGE[role] : null;
  // Links sit under small section headings, in the order the groups first appear in NAV.
  const groups = visibleNav.reduce<{ title: string; items: NavItem[] }[]>((acc, item) => {
    const g = acc.find((x) => x.title === item.group);
    if (g) g.items.push(item); else acc.push({ title: item.group, items: [item] });
    return acc;
  }, []);

  return (
    <div style={ready ? undefined : { visibility: 'hidden' }} className="dark-surface flex h-screen bg-[color:var(--bg-page)] text-[color:var(--t-body)]">
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 border-r flex flex-col bg-[color:var(--bg-panel)] border-[color:var(--border-subtle)] transition-transform duration-200 lg:static lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-4 h-12 border-b border-[color:var(--border-subtle)] flex items-center gap-2.5 shrink-0">
          <span className="w-6 h-6 rounded-md bg-brand-500 text-white flex items-center justify-center text-[11px] font-bold" aria-hidden>T</span>
          <span className="text-sm font-semibold text-[color:var(--t-strong)] truncate">{t('Telehealth Portal')}</span>
          {badge && (
            <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
              {t(badge.label)}
            </span>
          )}
        </div>

        <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.title} className="mb-4">
              <p className="px-2.5 mb-1 text-[11px] font-medium text-[color:var(--t-dim)]">{t(g.title)}</p>
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const active =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname === item.href || pathname.startsWith(item.href + '/');
                  const badgeCount = item.badgeKey ? counts[item.badgeKey] : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`group flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] rounded-md border transition-colors ${
                        active
                          ? 'bg-[color:var(--bg-card)] border-[color:var(--border)] text-[color:var(--t-strong)] font-medium'
                          : 'border-transparent text-[color:var(--t-muted)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--t-strong)]'
                      }`}
                    >
                      <NavIcon name={item.icon} className={`w-4 h-4 shrink-0 ${active ? 'text-brand-500' : 'text-[color:var(--t-dim)] group-hover:text-[color:var(--t-muted)]'}`} />
                      <span className="flex-1 truncate">{t(item.label)}</span>
                      {badgeCount > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-12 border-b flex items-center justify-between px-6 shrink-0 bg-[color:var(--bg-panel)] border-[color:var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t('Open menu')}
            className="lg:hidden w-9 h-9 rounded-lg border border-[color:var(--border)] text-[color:var(--t-strong)] flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" /></svg>
          </button>
          <div className="hidden lg:block" /> {/* spacer */}
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
            <NotificationBell />
            <div className="w-px h-5 bg-[color:var(--border)]" />
            <button
              onClick={handleLogout}
              aria-label={t('Sign out')}
              className="text-sm flex items-center gap-1.5 text-[color:var(--t-muted)] hover:text-[color:var(--t-strong)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 12H9m0 0l3-3m-3 3l3 3" />
              </svg>
              <span className="hidden sm:inline">{t('Sign out')}</span>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{authChecked ? children : null}</main>
      </div>
    </div>
  );
}
