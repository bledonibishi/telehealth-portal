'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { MY_REFERRAL } from '@/graphql/referrals';
import { Icon } from '@/components/portal/Icon';

/** Home screen: the patient's referral link, ready to copy, and what it has earned so far. The full page is Refer & earn. */
export function ReferralCard() {
  // Fetched again on each visit: a friend signing up sends no notification that would refresh the home screen.
  const { data } = useQuery(MY_REFERRAL, { fetchPolicy: 'cache-and-network' });
  const [copied, setCopied] = useState(false);
  const referral = data?.myReferral;
  if (!referral) return null;

  const joined = referral.referrals.filter((r: { status: string }) => r.status === 'CONVERTED').length;
  // Only rewards for referring a friend: the patient's own welcome discount, kept for later, is not one of them.
  const waiting = referral.vouchers.filter((v: { kind: string; status: string }) => v.kind === 'REFERRER_REWARD' && v.status === 'ISSUED').length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the Refer & earn page shows the link to copy by hand.
    }
  };

  return (
    <section aria-labelledby="referral-card-title" className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink-700 to-ink-900 p-5 text-white">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/5" />
      <div className="relative">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"><Icon name="gift" className="h-5 w-5" /></span>
        <h2 id="referral-card-title" className="mt-3 text-lg font-bold leading-snug">Give {referral.reward}, get {referral.reward}</h2>
        <p className="mt-1 text-sm text-white/75">
          {joined > 0
            ? `${joined} ${joined === 1 ? 'friend has' : 'friends have'} joined with your link.${waiting ? ` ${waiting} ${waiting === 1 ? 'reward is' : 'rewards are'} waiting for you.` : ''}`
            : 'Invite a friend. When they make their first payment, you both get money off.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50 transition-colors">
            <Icon name={copied ? 'check' : 'clip'} className="h-4 w-4" /> {copied ? 'Link copied' : 'Copy my link'}
          </button>
          <Link href="/rewards" className="inline-flex items-center justify-center gap-1 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20 transition-colors">
            Details <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
