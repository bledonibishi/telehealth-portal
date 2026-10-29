'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useApolloClient, useQuery } from '@apollo/client';
import { Sidebar, type NavItem } from '@/components/portal/Sidebar';
import { TopBar } from '@/components/portal/TopBar';
import { BottomNav } from '@/components/portal/BottomNav';
import { Icon } from '@/components/portal/Icon';
import { isAuthenticated, clearToken } from '@/lib/auth';
import { MY_ONBOARDING } from '@/graphql/onboarding';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';
import { MY_SYMPTOM_SCALE } from '@/graphql/symptoms';
import { MY_TREATMENT_PLAN } from '@/graphql/portal';
import { UNREAD_NOTIFICATION_COUNT } from '@/graphql/notifications';
import { doseWords } from '@/lib/dose-words';
import { ErrorAlert } from '@/components/common/Alert';
import { LoadingState } from '@telehealth/loading';
import { GuideProvider } from '@telehealth/guide/web';
import { WELCOME_TOUR, pageTourFor } from '@/lib/guide-tours';

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/treatment-plan', label: 'My Treatment', icon: 'plan' },
  { href: '/weight-journey', label: 'Weight Journey', icon: 'scale' },
  { href: '/doses', label: 'Injections', icon: 'syringe' },
  { href: '/appointments', label: 'Appointments', icon: 'calendar' },
  { href: '/messages', label: 'Help & messages', icon: 'chat', badge: 'messages' },
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

  const { data: onboardingData, error: onboardingError, refetch: retryOnboarding } = useQuery(MY_ONBOARDING, {
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
  // Shares the cache with the dashboard. Hormone treatment is gels, patches and capsules: the menu names the dose calendar by
  // the form of the medicine actually prescribed, so "Injections" appears only for pens and vials.
  const { data: planData } = useQuery(MY_TREATMENT_PLAN, { skip: !isAuthenticated() || onboardingStatus !== 'APPROVED', fetchPolicy: 'cache-first' });
  const calendarLabel = doseWords(planData?.myTreatmentPlan?.form).calendar;
  const navItems: NavItem[] = [
    ...NAV.filter((i) => i.href !== WEIGHT_HREF || journeyData?.myWeightJourney).map((i) => (i.href === '/doses' ? { ...i, label: calendarLabel, icon: calendarLabel === 'Injections' ? i.icon : 'calendar' } : i)),
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

  // News from the care team (a decision, a reply, an order on its way) makes the open screens fetch again, so what the
  // patient is waiting for shows up without a reload. The bell polls the count; this only reacts when it goes up.
  const { data: unreadData } = useQuery(UNREAD_NOTIFICATION_COUNT, { skip: !isAuthenticated() || onboardingStatus !== 'APPROVED' });
  const unreadNews: number | undefined = unreadData?.unreadNotificationCount;
  const lastUnreadNews = useRef<number | undefined>(undefined);
  useEffect(() => {
    const before = lastUnreadNews.current;
    lastUnreadNews.current = unreadNews;
    if (before !== undefined && unreadNews !== undefined && unreadNews > before) apollo.refetchQueries({ include: 'active' }).catch(() => undefined);
  }, [unreadNews, apollo]);

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
          // A session that really ended is handled where the request is made (apollo.ts). Anything else, such as a
          // dropped connection, is not a reason to sign the patient out: say so and let them try again.
          <ErrorAlert
            error={onboardingError}
            className="max-w-md mx-4"
            action={
              <span className="flex gap-4 text-sm font-semibold underline underline-offset-2">
                <button type="button" onClick={() => { retryOnboarding().catch(() => undefined); }}>Try again</button>
                <button type="button" onClick={handleLogout}>Sign out</button>
              </span>
            }
          />
        ) : (
          <LoadingState variant="inline" label="Loading…" />
        )}
      </div>
    );
  }

  return (
    // On phones the Guide button sits above the bottom menu.
    <GuideProvider welcome={WELCOME_TOUR} pageTour={authChecked ? pageTourFor(pathname) : null} pageKey={pathname} launcherBottom={88}>
    <div className="flex h-dvh bg-surface">
      <aside className="hidden lg:block w-60 flex-shrink-0">
        <Sidebar items={navItems} />
      </aside>

      {/* Phone and tablet: the same sidebar as a drawer. */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-72 max-w-[85vw] h-full relative">
            <Sidebar items={navItems} onNavigate={() => setMenuOpen(false)} />
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="absolute top-5 right-3 w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-900/5 flex items-center justify-center">
              <Icon name="close" />
            </button>
          </div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-slate-900/40" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Room at the bottom on phones for the bottom menu. */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <TopBar onMenu={() => setMenuOpen(true)} onSignOut={handleLogout} />
          {authChecked ? children : null}
        </main>
        <BottomNav dosesLabel={calendarLabel} dosesIcon={calendarLabel === 'Injections' ? 'syringe' : 'calendar'} onMore={() => setMenuOpen(true)} />
      </div>
    </div>
    </GuideProvider>
  );
}
