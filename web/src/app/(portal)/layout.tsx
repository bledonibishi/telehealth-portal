'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { isAuthenticated, clearToken } from '@/lib/auth';
import { MY_ONBOARDING } from '@/graphql/onboarding';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/consultations', label: 'My consultations', icon: '📋' },
  { href: '/doses', label: 'My doses', icon: '📅' },
  { href: '/messages', label: 'Messages', icon: '💬' },
  { href: '/prescription', label: 'Prescriptions', icon: '💊' },
];

// Only weight-management patients have a journey (the API returns null otherwise).
const WEIGHT_NAV = { href: '/weight-journey', label: 'Weight journey', icon: '⚖️' };

// Patients can still reach support while onboarding is incomplete.
const ONBOARDING_EXEMPT_PATHS = ['/messages'];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Hold back the pages until the browser confirms a token, so their queries never run
  // during server rendering or before the redirect to /login.
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    setAuthChecked(true);
  }, [router]);

  const { data: onboardingData, error: onboardingError } = useQuery(MY_ONBOARDING, {
    skip: !isAuthenticated(),
    fetchPolicy: 'cache-and-network',
  });
  const onboardingStatus = onboardingData?.myOnboarding?.status;

  // Shares the cache with the dashboard's query, so this costs no extra request there.
  const { data: journeyData } = useQuery(MY_WEIGHT_JOURNEY, {
    skip: !isAuthenticated() || onboardingStatus !== 'APPROVED',
    fetchPolicy: 'cache-and-network',
  });
  const navItems = journeyData?.myWeightJourney ? [...NAV, WEIGHT_NAV] : NAV;

  const handleLogout = () => {
    clearToken();
    router.replace('/login');
  };

  useEffect(() => {
    if (!onboardingError) return;
    // Most likely an expired/invalid token — send them back to log in rather
    // than getting stuck on a blank gated screen forever.
    handleLogout();
  }, [onboardingError]);

  useEffect(() => {
    if (!onboardingStatus) return;
    if (onboardingStatus !== 'APPROVED' && !ONBOARDING_EXEMPT_PATHS.includes(pathname)) {
      router.replace('/onboarding');
    }
  }, [onboardingStatus, pathname, router]);

  const gated = !ONBOARDING_EXEMPT_PATHS.includes(pathname) && onboardingStatus !== 'APPROVED';
  if (gated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        {onboardingError ? (
          <p className="text-sm text-slate-400">Signing you out…</p>
        ) : (
          <p className="text-sm text-slate-400">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50">
      {/* Phone: a compact top bar with scrollable tabs. Tablet and up: the sidebar. */}
      <header className="md:hidden bg-white border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="font-bold text-lg text-slate-900 tracking-tight">telehealth</span>
          <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-slate-600">Sign out</button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2" aria-label="Main">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
                  active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <aside className="hidden md:flex w-60 bg-white border-r border-slate-100 flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-slate-100">
          <span className="font-bold text-lg text-slate-900 tracking-tight">telehealth</span>
          <p className="text-xs text-slate-400 mt-0.5">Patient portal</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
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

      <main className="flex-1 overflow-y-auto">{authChecked ? children : null}</main>
    </div>
  );
}
