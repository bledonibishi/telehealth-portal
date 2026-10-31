'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { PasswordInput } from '@/components/common/PasswordInput';
import { InlineError } from '@/components/common/Alert';
import { CHANGE_MY_PASSWORD } from '@/graphql/portal';
import { setToken } from '@/lib/auth';
import { realtime } from '@/lib/apollo';
import { Card, btnPrimary } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';
import { SettingsSubpage } from '@/components/portal/SettingsMenu';

const field = 'w-full border border-slate-300 rounded-xl px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ink-600 focus:border-transparent';
const label = 'block text-sm font-medium text-ink-900 mb-1.5';

/** A rule the new password has to meet, ticked off as the patient types. */
function Rule({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2.5 ${met ? 'text-emerald-700' : 'text-slate-500'}`}>
      <span className={`flex w-5 h-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${met ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300'}`}>
        {met && <Icon name="check" className="w-3.5 h-3.5" />}
      </span>
      {children}
    </li>
  );
}

/** Change your own password. The current one is asked for, so someone at an unlocked screen can't lock you out. */
function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
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
      setProblem(err);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      <div><label htmlFor="pw-current" className={label}>Current password</label><PasswordInput id="pw-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} required /></div>
      <div className="border-t border-slate-100" />
      <div><label htmlFor="pw-new" className={label}>New password</label><PasswordInput id="pw-new" autoComplete="new-password" minLength={10} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} className={field} required /></div>
      <div><label htmlFor="pw-again" className={label}>Type the new password again</label><PasswordInput id="pw-again" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={field} required /></div>
      <ul className="space-y-1.5 text-sm">
        <Rule met={next.length >= 10}>At least 10 characters</Rule>
        <Rule met={!!next && next === again}>Both new passwords match</Rule>
      </ul>
      <div className="space-y-3" aria-live="polite">
        <InlineError error={problem} />
        {done && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">✓ Password changed. Your other devices were signed out.</p>}
        <button type="submit" disabled={loading} className={`${btnPrimary} w-full sm:w-auto sm:px-6`}>{loading ? 'Saving…' : 'Change password'}</button>
      </div>
    </form>
  );
}

const TIPS = [
  'Use a short sentence or three or four unrelated words. Longer is stronger than complicated.',
  'Don’t reuse a password from your email, bank or another website.',
  'A password manager, like the one built into your phone or browser, can create and remember it for you.',
];

export default function PasswordPage() {
  return (
    <SettingsSubpage wide title="Password" subtitle="Change the password you sign in with. You’ll need your current one.">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        <Card className="sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="flex w-11 h-11 items-center justify-center rounded-full bg-ink-50 text-ink-700"><Icon name="lock" className="w-5 h-5" /></span>
            <div>
              <h2 className="text-base font-semibold text-ink-900">Change your password</h2>
              <p className="text-sm text-slate-500">It takes effect straight away.</p>
            </div>
          </div>
          <PasswordForm />
        </Card>

        <aside className="space-y-5">
          <div className="rounded-2xl bg-ink-50/70 border border-ink-100 p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-ink-900 mb-3">A good password</h2>
            <ul className="space-y-3 text-sm text-slate-600">
              {TIPS.map((t) => (
                <li key={t} className="flex gap-2.5"><Icon name="check" className="w-4 h-4 mt-0.5 flex-shrink-0 text-ink-700" /><span>{t}</span></li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200/80 p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900 mb-2"><Icon name="shield" className="w-4 h-4 text-ink-700" /> What happens next</h2>
            <p className="text-sm text-slate-600">You stay signed in here. Every other phone or computer signed in to your account is signed out, so change it straight away if you think someone else knows your password.</p>
          </div>
        </aside>
      </div>
    </SettingsSubpage>
  );
}
