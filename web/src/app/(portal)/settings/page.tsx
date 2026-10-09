'use client';

import { PasswordInput } from '@/components/common/PasswordInput';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client';
import { CHANGE_MY_PASSWORD } from '@/graphql/portal';
import { clearToken, setToken } from '@/lib/auth';
import { realtime } from '@/lib/apollo';
import { CONTACT, EMERGENCY_NUMBER, telHref } from '@/lib/contact';
import { ManageSubscriptionButton } from '@/components/billing/ManageSubscriptionCard';
import { StopOrRefundCard } from '@/components/billing/StopOrRefundCard';
import { Card, CardHeader, btnPrimary, btnSoft } from '@/components/portal/Card';
import { PageHeader } from '@/components/portal/PageHeader';
import { Icon } from '@/components/portal/Icon';

const FAQ: Array<[string, string]> = [
  ['When will my next supply arrive?', 'A few days before your current supply runs out, use “Order next dose early”. Your doctor approves it and the pharmacy sends it; you can follow it under Orders.'],
  ['What if I miss an injection?', 'Log it as skipped on your dose calendar and message your doctor — they’ll tell you whether to take it late or wait for the next one.'],
  ['Who can see my photos?', 'Only you and the doctors treating you. Every time a doctor opens one, it is recorded.'],
  ['How do I change or cancel my subscription?', 'Use “Manage subscription” below. It opens our payment provider, where you can update your card, see invoices, pause or cancel.'],
  ['Something feels wrong — what should I do?', `For chest pain, trouble breathing, severe stomach pain or fainting call ${EMERGENCY_NUMBER}. Otherwise book an urgent appointment — a doctor replies within 24 hours.`],
];

const field = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink-600';

/** Change your own password. The current one is asked for, so someone at an unlocked screen can't lock you out. */
function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [change, { loading }] = useMutation(CHANGE_MY_PASSWORD);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    if (next.length < 10) return setProblem('Use at least 10 characters.');
    if (next !== again) return setProblem('The two new passwords don’t match.');
    setProblem(null);
    try {
      const { data } = await change({ variables: { currentPassword: current, newPassword: next } });
      // Changing the password ends every other session; these tokens keep this one signed in.
      if (data?.changeMyPassword) {
        setToken(data.changeMyPassword.accessToken, data.changeMyPassword.refreshToken);
        realtime?.reconnect();
      }
      setCurrent(''); setNext(''); setAgain('');
      setDone(true);
    } catch (err: any) {
      setProblem(err?.message ?? 'Couldn’t change your password. Please try again.');
    }
  };
  return (
    <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3 items-end">
      <div><label htmlFor="pw-current" className="block text-xs font-medium text-slate-500 mb-1">Current password</label><PasswordInput id="pw-current"  autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} required /></div>
      <div><label htmlFor="pw-new" className="block text-xs font-medium text-slate-500 mb-1">New password</label><PasswordInput id="pw-new"  autoComplete="new-password" minLength={10} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} className={field} required /></div>
      <div><label htmlFor="pw-again" className="block text-xs font-medium text-slate-500 mb-1">New password again</label><PasswordInput id="pw-again"  autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={field} required /></div>
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3" aria-live="polite">
        <button type="submit" disabled={loading || !current || !next || !again} className={btnPrimary}>{loading ? 'Saving…' : 'Change password'}</button>
        {problem && <p role="alert" className="text-sm text-red-600">{problem}</p>}
        {done && <p className="text-sm text-emerald-700">✓ Password changed. Your other devices were signed out.</p>}
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const apollo = useApolloClient();
  const signOut = () => {
    clearToken();
    apollo.clearStore();
    router.replace('/login');
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-4xl space-y-5">
      <PageHeader title="Settings" subtitle="Your subscription, privacy and help." />

      <Card>
        <CardHeader title="Subscription & billing" subtitle="Update your card, see invoices, pause or cancel." />
        <div className="flex"><ManageSubscriptionButton /></div>
      </Card>

      <Card>
        <CardHeader title="Stop or refund" subtitle="Stop future payments, or ask the clinic for your money back." />
        <StopOrRefundCard />
      </Card>

      <Card>
        <CardHeader title="Password" subtitle="At least 10 characters. Other devices stay signed in until their session ends." />
        <PasswordForm />
      </Card>

      <Card>
        <CardHeader title="Account" />
        <div className="flex flex-wrap gap-3">
          <Link href="/profile" className={btnSoft}><Icon name="user" className="w-4 h-4" /> Edit profile</Link>
          <Link href="/rewards" className={btnSoft}><Icon name="gift" className="w-4 h-4" /> Refer & earn</Link>
          <button type="button" onClick={signOut} className={btnSoft}><Icon name="logout" className="w-4 h-4" /> Sign out</button>
        </div>
      </Card>

      <section id="privacy">
        <Card>
          <CardHeader title="Privacy" />
          <ul className="text-sm text-slate-600 space-y-2">
            <li className="flex gap-2"><Icon name="shield" className="w-4 h-4 text-ink-700 flex-shrink-0 mt-0.5" /> Your medical details, photos and messages are visible only to you and the clinical team treating you.</li>
            <li className="flex gap-2"><Icon name="shield" className="w-4 h-4 text-ink-700 flex-shrink-0 mt-0.5" /> Uploaded photos and documents are never public: each one is checked against who is asking before it is shown.</li>
            <li className="flex gap-2"><Icon name="shield" className="w-4 h-4 text-ink-700 flex-shrink-0 mt-0.5" /> To get a copy of your data or delete your account, <Link href="/messages" className="text-ink-600 underline">message us</Link>.</li>
          </ul>
        </Card>
      </section>

      <section id="help">
        <Card>
          <CardHeader title="Help & FAQ" />
          <div className="divide-y divide-slate-100">
            {FAQ.map(([q, a]) => (
              <details key={q} className="py-3 group">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-medium text-ink-900">
                  {q}<Icon name="chevron" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <p className="text-sm text-slate-600 mt-2">{a}</p>
              </details>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-4 text-sm">
            <Link href="/messages" className={btnSoft}><Icon name="chat" className="w-4 h-4" /> Message support</Link>
            {CONTACT.phone && <a href={telHref(CONTACT.phone)} className={btnSoft}><Icon name="phone" className="w-4 h-4" /> {CONTACT.phone}</a>}
            {CONTACT.email && <a href={`mailto:${CONTACT.email}`} className={btnSoft}><Icon name="mail" className="w-4 h-4" /> {CONTACT.email}</a>}
          </div>
        </Card>
      </section>
    </div>
  );
}
