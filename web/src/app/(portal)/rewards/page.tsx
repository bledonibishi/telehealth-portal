'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { APPLY_VOUCHER, MY_REFERRAL } from '@/graphql/referrals';
import { VoucherAutoApplyToggle } from '@/components/portal/VoucherAutoApplyToggle';
import { InlineError } from '@/components/common/Alert';
import { Card } from '@/components/portal/Card';
import { Icon, type IconName } from '@/components/portal/Icon';
import { PageHeader } from '@/components/portal/PageHeader';
import { formatMoney } from '@/lib/money';
import { SettingsBackLink } from '@/components/portal/SettingsMenu';

type Voucher = {
  id: string;
  kind: 'REFERRER_REWARD' | 'REFEREE_REWARD';
  amountCents: number;
  currency: string;
  status: 'ISSUED' | 'APPLIED';
  issuedAt: string;
  appliedAt?: string | null;
  note?: string | null;
};

type ReferredFriend = {
  id: string;
  firstNameInitial: string;
  status: 'PENDING' | 'CONVERTED';
  createdAt: string;
  convertedAt?: string | null;
};

const money = (cents: number, currency: string) => formatMoney(cents, currency, { wholeWithoutCents: true });

// Kept free of medicine and condition names: a referral message is the patient's own, but it must not read as an
// advert for a prescription medicine.
const shareText = (reward: string) => `I use Omo Pharmacy for my treatment, with a doctor online. Sign up with my link and we both get ${reward} off:`;

function VoucherRow({ voucher }: { voucher: Voucher }) {
  const [applyVoucher, { loading, error }] = useMutation(APPLY_VOUCHER, {
    variables: { voucherId: voucher.id },
    refetchQueries: [{ query: MY_REFERRAL }],
  });
  const label = voucher.kind === 'REFERRER_REWARD' ? 'Referral reward' : 'Welcome discount';
  const applied = voucher.status === 'APPLIED';

  return (
    <li className="flex items-center gap-4 py-3.5">
      <span className={`flex w-10 h-10 flex-shrink-0 items-center justify-center rounded-full ${applied ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
        <Icon name="gift" className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{money(voucher.amountCents, voucher.currency)} · {label}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {voucher.note ?? (applied ? 'Taken off a payment' : 'Ready to use')}
          {voucher.appliedAt && ` · ${format(new Date(voucher.appliedAt), 'd MMM yyyy')}`}
        </p>
        <InlineError error={error} size="xs" className="mt-0.5" />
      </div>
      {applied ? (
        <span className="flex-shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">Used</span>
      ) : (
        <button
          type="button"
          onClick={() => applyVoucher().catch(() => {})}
          disabled={loading}
          className="flex-shrink-0 rounded-full bg-ink-700 hover:bg-ink-800 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {loading ? 'Applying…' : 'Use now'}
        </button>
      )}
    </li>
  );
}

function FriendRow({ friend, reward }: { friend: ReferredFriend; reward: string }) {
  const joined = friend.status === 'CONVERTED';
  return (
    <li className="flex items-center gap-4 py-3.5">
      <span className="flex w-10 h-10 flex-shrink-0 items-center justify-center rounded-full bg-ink-50 text-sm font-semibold text-ink-800">{friend.firstNameInitial}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">Friend {friend.firstNameInitial}.</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {joined ? `Joined ${format(new Date(friend.convertedAt!), 'd MMM yyyy')} · you earned ${reward}` : `Signed up ${format(new Date(friend.createdAt), 'd MMM yyyy')} · waiting for their first payment`}
        </p>
      </div>
      <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${joined ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
        {joined ? 'Joined' : 'Pending'}
      </span>
    </li>
  );
}

function Empty({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="py-8 text-center">
      <span className="mx-auto flex w-12 h-12 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Icon name={icon} className="w-6 h-6" /></span>
      <p className="mt-3 text-sm font-semibold text-ink-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-4 py-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-white/70">{label}</p>
    </div>
  );
}

export default function RewardsPage() {
  const { data, loading, error } = useQuery(MY_REFERRAL, { fetchPolicy: 'cache-and-network' });
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && !!navigator.share), []);

  const referral = data?.myReferral;
  const reward: string = referral?.reward ?? '';
  const vouchers: Voucher[] = referral?.vouchers ?? [];
  const friends: ReferredFriend[] = referral?.referrals ?? [];
  const joined = friends.filter((f) => f.status === 'CONVERTED').length;
  const earned = vouchers.filter((v) => v.kind === 'REFERRER_REWARD');
  // One total per currency: amounts in different currencies can't be added (older vouchers keep the currency they were made in).
  const byCurrency = new Map<string, number>();
  for (const v of earned) byCurrency.set(v.currency, (byCurrency.get(v.currency) ?? 0) + v.amountCents);
  const earnedTotal = byCurrency.size ? [...byCurrency].map(([cur, cents]) => money(cents, cur)).join(' · ') : '—';

  const copy = async () => {
    if (!referral?.link) return;
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied — the link is still visible to copy by hand.
    }
  };
  const share = () => navigator.share?.({ title: 'Omo Pharmacy', text: shareText(reward), url: referral.link }).catch(() => {});
  const message = referral ? `${shareText(reward)} ${referral.link}` : '';

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-5xl">
      <SettingsBackLink />
      <PageHeader title="Refer & earn" subtitle="Invite friends to Omo Pharmacy and you both save." />

      {error && !referral && <InlineError error={error} />}
      {loading && !referral && <div className="h-72 rounded-3xl bg-slate-100 animate-pulse" />}

      {referral && (
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-700 via-ink-800 to-ink-950 text-white p-6 sm:p-10">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 w-72 h-72 rounded-full bg-white/5" />
            <div aria-hidden className="pointer-events-none absolute right-24 -bottom-24 w-56 h-56 rounded-full bg-white/5" />
            <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-end">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold"><Icon name="gift" className="w-3.5 h-3.5" /> Refer a friend</span>
                <h2 className="mt-4 text-3xl sm:text-4xl font-bold leading-tight">Give {reward}, get {reward}</h2>
                <p className="mt-2 max-w-lg text-white/80">Share your link. When a friend makes their first payment, they get {reward} off and so do you.</p>

                <div className="mt-6 flex flex-col sm:flex-row gap-2 rounded-2xl bg-white p-1.5">
                  <input
                    readOnly
                    aria-label="Your referral link"
                    value={referral.link}
                    onFocus={(e) => e.target.select()}
                    className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-ink-900 focus:outline-none"
                  />
                  <button type="button" onClick={copy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink-700 hover:bg-ink-800 px-5 py-2.5 text-sm font-semibold text-white transition-colors">
                    <Icon name={copied ? 'check' : 'clip'} className="w-4 h-4" /> {copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-semibold transition-colors">
                    <Icon name="chat" className="w-4 h-4" /> WhatsApp
                  </a>
                  <a href={`mailto:?subject=${encodeURIComponent(`${reward} off at Omo Pharmacy`)}&body=${encodeURIComponent(message)}`} className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-semibold transition-colors">
                    <Icon name="mail" className="w-4 h-4" /> Email
                  </a>
                  {canShare && (
                    <button type="button" onClick={share} className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-semibold transition-colors">
                      <Icon name="arrow" className="w-4 h-4" /> More
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 lg:grid-cols-1 gap-2">
                <Stat value={friends.length} label="Friends invited" />
                <Stat value={joined} label="Joined" />
                <Stat value={earnedTotal} label="You’ve earned" />
              </div>
            </div>
          </section>

          <section>
            <h2 className="px-1 mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">How it works</h2>
            <ol className="grid gap-4 sm:grid-cols-3">
              {([
                ['clip', 'Share your link', 'Send it by WhatsApp, email or however you like.'],
                ['user', 'Your friend signs up', `They get ${reward} off when they make their first payment.`],
                ['gift', `You get ${reward}`, 'Your reward is taken off your next payment.'],
              ] as Array<[IconName, string, string]>).map(([icon, title, body], i) => (
                <li key={title}>
                  <Card className="h-full sm:p-6">
                    <div className="flex items-center gap-3">
                      <span className="flex w-10 h-10 items-center justify-center rounded-full bg-ink-50 text-ink-700"><Icon name={icon} className="w-5 h-5" /></span>
                      <span className="text-xs font-semibold text-slate-400">Step {i + 1}</span>
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{body}</p>
                  </Card>
                </li>
              ))}
            </ol>
          </section>

          <Card className="sm:p-6">
            <VoucherAutoApplyToggle />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2 items-start">
            <Card className="sm:p-6">
              <h2 className="text-base font-semibold text-ink-900">Your rewards</h2>
              {vouchers.length === 0 ? (
                <Empty icon="gift" title="No rewards yet" body={`You’ll get ${reward} for every friend who joins.`} />
              ) : (
                <ul className="mt-1 divide-y divide-slate-100">{vouchers.map((v) => <VoucherRow key={v.id} voucher={v} />)}</ul>
              )}
            </Card>

            <Card className="sm:p-6">
              <h2 className="text-base font-semibold text-ink-900">Friends you’ve invited</h2>
              {friends.length === 0 ? (
                <Empty icon="user" title="No friends yet" body="Share your link above. You’ll see each friend here as they sign up." />
              ) : (
                <ul className="mt-1 divide-y divide-slate-100">{friends.map((f) => <FriendRow key={f.id} friend={f} reward={reward} />)}</ul>
              )}
            </Card>
          </div>

          <p className="px-1 text-xs text-slate-500">
            We only show your friends’ first initial, never their health details. Rewards are given once per friend, after their first payment.
          </p>
        </div>
      )}
    </div>
  );
}
