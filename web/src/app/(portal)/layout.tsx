'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useApolloClient, useQuery } from '@apollo/client';
import { Sidebar, type NavItem } from '@/components/portal/Sidebar';
import { TopBar } from '@/components/portal/TopBar';
import { Icon } from '@/components/portal/Icon';
import { isAuthenticated, clearToken } from '@/lib/auth';
import { MY_ONBOARDING } from '@/graphql/onboarding';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';
import { MY_SYMPTOM_SCALE } from '@/graphql/symptoms';
import { MY_PRODUCT_KIND } from '@/graphql/intake';

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/treatment-plan', label: 'My Treatment', icon: 'plan' },
  { href: '/weight-journey', label: 'Weight Journey', icon: 'scale' },
  { href: '/doses', label: 'Injections', icon: 'syringe' },
  { href: '/appointments', label: 'Appointments', icon: 'calendar' },
  { href: '/messages', label: 'Messages', icon: 'chat', badge: 'messages' },
  { href: '/care-team', label: 'My Doctor', icon: 'heart' },
  { href: '/orders', label: 'Orders', icon: 'cart' },
  { href: '/prescription', label: 'Prescriptions', icon: 'rx' },
  { href: '/documents', label: 'Documents', icon: 'folder' },
];

// Only weight-management patients have a journey (the API returns null otherwise).
const WEIGHT_HREF = '/weight-journey';
// Only hormone-programme patients have a symptom scale (null otherwise).
const SYMPTOMS_NAV: NavItem = { href: '/symptoms', label: 'Symptoms', icon: 'chart' };

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
  const { data: scaleData } = useQuery(MY_SYMPTOM_SCALE, {
    skip: !isAuthenticated() || onboardingStatus !== 'APPROVED',
  });
  const { data: kindData } = useQuery(MY_PRODUCT_KIND, { skip: !isAuthenticated() || onboardingStatus !== 'APPROVED' });
  // Hormone treatment is gels, patches and capsules — calling its schedule "Injections" would be wrong.
  const hormone = kindData?.myProductKind === 'HRT';
  const navItems: NavItem[] = [
    ...NAV.filter((i) => i.href !== WEIGHT_HREF || journeyData?.myWeightJourney).map((i) => (i.href === '/doses' && hormone ? { ...i, label: 'My doses' } : i)),
    ...(scaleData?.mySymptomScale ? [SYMPTOMS_NAV] : []),
  ];
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

  const apollo = useApolloClient();
  const handleLogout = () => {
    clearToken();
    // Patient-scoped queries are cached without the patient in their key, so the
    // next person to sign in on this browser must not be shown this one's data.
    apollo.clearStore();
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
    // Until onboarding is approved nothing in the portal opens, Messages included: support is the chat
    // inside onboarding. Declined patients are held there too.
    if (onboardingStatus !== 'APPROVED') {
      router.replace('/onboarding');
    }
  }, [onboardingStatus, pathname, router]);

  const gated = onboardingStatus !== 'APPROVED';
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
    <div className="flex h-screen bg-[#f4f7fc]">
      <aside className="hidden lg:block w-56 flex-shrink-0">
        <Sidebar items={navItems} />
      </aside>

      {/* Phone and tablet: the same sidebar as a drawer. */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-72 max-w-[85vw] h-full relative">
            <Sidebar items={navItems} onNavigate={() => setMenuOpen(false)} />
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="absolute top-5 right-3 w-9 h-9 rounded-lg text-white/80 hover:bg-white/10 flex items-center justify-center">
              <Icon name="close" />
            </button>
          </div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-slate-900/40" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 overflow-y-auto">
          <TopBar onMenu={() => setMenuOpen(true)} onSignOut={handleLogout} />
          {authChecked ? children : null}
        </main>
      </div>
    </div>
  );
}
