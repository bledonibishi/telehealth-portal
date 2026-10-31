'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApolloClient, useQuery } from '@apollo/client';
import { MY_PROFILE } from '@/graphql/portal';
import { clearToken } from '@/lib/auth';
import { Card, btnSoft } from '@/components/portal/Card';
import { Avatar, Icon } from '@/components/portal/Icon';
import { PageHeader } from '@/components/portal/PageHeader';
import { GuideToggle } from '@/components/portal/GuideToggle';
import { LanguageSwitch } from '@/components/portal/LanguageSwitch';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { SettingsGroup, SettingsRow } from '@/components/portal/SettingsMenu';

/** The Settings menu. Each row opens a page of its own, so patients find a setting by its name instead of scrolling. */
export default function SettingsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const apollo = useApolloClient();
  const { data } = useQuery(MY_PROFILE, { fetchPolicy: 'cache-first' });
  const p = data?.myProfile;
  const signOut = () => {
    clearToken();
    apollo.clearStore();
    router.replace('/login');
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-5xl">
      <PageHeader title="Settings" subtitle="Your account, payments, privacy and help." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
        <div className="space-y-6">
          <SettingsGroup title="Account">
            <SettingsRow href="/profile" icon="user" label="Profile" hint="Your personal, body and delivery details." />
            <SettingsRow href="/settings/password" icon="lock" label="Password" hint="Change the password you sign in with." />
            <SettingsRow href="/settings/notifications" icon="bell" label="Notifications" hint="What we send to your phone and by email." />
          </SettingsGroup>

          <SettingsGroup title="Payments">
            <SettingsRow href="/settings/billing" icon="cart" label="Billing & payments" hint="Your subscription, payments, refunds and vouchers." />
            <SettingsRow href="/rewards" icon="gift" label="Refer & earn" hint="Invite a friend and get a voucher when they join." />
          </SettingsGroup>

          <SettingsGroup title="Help & privacy">
            <SettingsRow href="/settings/help" icon="help" label="Help & FAQ" hint="Answers to common questions, and how to reach us." />
            <SettingsRow href="/settings/privacy" icon="shield" label="Privacy & your data" hint="Who can see your details. Get a copy or delete your account." />
          </SettingsGroup>

          <SettingsGroup title="Session">
            <SettingsRow onClick={signOut} icon="logout" label="Sign out" danger />
          </SettingsGroup>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6">
          <Card className="text-center sm:p-6">
            <Avatar first={p?.firstName} last={p?.lastName} className="mx-auto w-16 h-16 text-xl" />
            <p className="mt-3 text-base font-semibold text-ink-900 truncate">{p ? `${p.firstName} ${p.lastName}` : '\u00a0'}</p>
            {p?.email && <p className="text-sm text-slate-500 truncate">{p.email}</p>}
            {p && <p className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Patient ID: {p.patientNumber}</p>}
            <Link href="/profile" className={`${btnSoft} mt-4 w-full`}><Icon name="pencil" className="w-4 h-4" /> Edit profile</Link>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-ink-900">Language · Gjuha</h2>
            <p className="mt-0.5 mb-3 text-xs text-slate-500">{t('The language the portal is shown in, on this device.')}</p>
            <LanguageSwitch className="w-full" />
          </Card>

          <Card guide="settings:guide">
            <GuideToggle />
          </Card>

          <div className="rounded-2xl bg-ink-50/70 border border-ink-100 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900"><Icon name="chat" className="w-4 h-4 text-ink-700" /> Need a hand?</h2>
            <p className="mt-1.5 text-sm text-slate-600">Can’t find a setting, or something isn’t working? Your care team can help.</p>
            <Link href="/messages" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-700 hover:text-ink-800">Message us <Icon name="arrow" className="w-4 h-4" /></Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
