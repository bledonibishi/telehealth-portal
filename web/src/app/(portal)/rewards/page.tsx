'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { APPLY_VOUCHER, MY_REFERRAL, SET_VOUCHER_AUTO_APPLY } from '@/graphql/referrals';
import { InlineError } from '@/components/common/Alert';

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

const formatMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(cents / 100);

function VoucherRow({ voucher }: { voucher: Voucher }) {
  const [applyVoucher, { loading, error }] = useMutation(APPLY_VOUCHER, {
    variables: { voucherId: voucher.id },
    refetchQueries: [{ query: MY_REFERRAL }],
  });

  const label = voucher.kind === 'REFERRER_REWARD' ? 'Referral reward' : 'Friend discount';

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-900">
          {label} · {formatMoney(voucher.amountCents, voucher.currency)}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {voucher.note ?? (voucher.status === 'APPLIED' ? 'Applied' : 'Ready to apply')}
          {voucher.appliedAt && ` · ${format(new Date(voucher.appliedAt), 'dd MMM yyyy')}`}
        </p>
        <InlineError error={error} size="xs" className="mt-0.5" />
      </div>
      {voucher.status === 'ISSUED' ? (
        <button
          onClick={() => applyVoucher()}
          disabled={loading}
          className="flex-shrink-0 text-xs font-semibold text-ink-700 hover:text-ink-800 disabled:opacity-50"
        >
          {loading ? 'Applying…' : 'Apply now'}
        </button>
      ) : (
        <span className="flex-shrink-0 text-xs font-medium text-slate-400">Applied</span>
      )}
    </div>
  );
}

function ReferralRow({ referral }: { referral: ReferredFriend }) {
  const isConverted = referral.status === 'CONVERTED';
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-900">Friend {referral.firstNameInitial}.</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {isConverted ? `Joined ${format(new Date(referral.convertedAt!), 'dd MMM yyyy')} — $20 credited` : 'Pending their first payment'}
        </p>
      </div>
      <span className={`flex-shrink-0 text-xs font-medium px-2 py-1 rounded-full ${isConverted ? 'bg-ink-50 text-ink-800' : 'bg-slate-100 text-slate-500'}`}>
        {isConverted ? 'Converted' : 'Pending'}
      </span>
    </div>
  );
}

export default function RewardsPage() {
  const { data, loading } = useQuery(MY_REFERRAL, { fetchPolicy: 'cache-and-network' });
  const [copied, setCopied] = useState(false);
  const [setVoucherAutoApply, { loading: togglingAutoApply }] = useMutation(SET_VOUCHER_AUTO_APPLY);

  const referral = data?.myReferral;
  const vouchers: Voucher[] = referral?.vouchers ?? [];
  const referrals: ReferredFriend[] = referral?.referrals ?? [];

  const handleCopy = async () => {
    if (!referral?.link) return;
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied — the link is still visible to copy by hand.
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-3xl">
      <div className="mb-5 -mt-1">
        <h1 className="text-2xl font-bold text-ink-900">Refer & earn</h1>
        <p className="text-sm text-slate-500 mt-1">
          Share your link — when a friend joins, you both get $20 off. Yours is credited automatically toward your next order.
        </p>
      </div>

      {!loading && referral && (
        <>
          <div className="bg-white rounded-lg border border-slate-100 p-6 mb-4">
            <p className="text-xs font-semibold text-ink-800 uppercase tracking-wide">Your referral link</p>
            <div className="flex items-center gap-2 mt-2">
              <input
                readOnly
                value={referral.link}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-md px-3 py-2 truncate"
              />
              <button
                onClick={handleCopy}
                className="flex-shrink-0 bg-ink-700 hover:bg-ink-800 text-white text-sm font-semibold px-4 py-2 rounded-md"
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-100 p-6 mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Automatically apply my rewards</p>
              <p className="text-xs text-slate-400 mt-0.5">When off, new rewards wait on this page until you apply them yourself.</p>
            </div>
            <button
              role="switch"
              aria-checked={referral.voucherAutoApply}
              disabled={togglingAutoApply}
              onClick={() => setVoucherAutoApply({ variables: { autoApply: !referral.voucherAutoApply } })}
              className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative disabled:opacity-50 ${
                referral.voucherAutoApply ? 'bg-ink-700' : 'bg-slate-200'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  referral.voucherAutoApply ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-100 p-6 mb-4">
            <p className="text-sm font-semibold text-slate-900 mb-1">Your rewards</p>
            {vouchers.length === 0 ? (
              <p className="text-sm text-slate-400 py-3">No rewards yet — share your link to start earning.</p>
            ) : (
              vouchers.map((v) => <VoucherRow key={v.id} voucher={v} />)
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-100 p-6">
            <p className="text-sm font-semibold text-slate-900 mb-1">Friends you've referred</p>
            {referrals.length === 0 ? (
              <p className="text-sm text-slate-400 py-3">No referrals yet.</p>
            ) : (
              referrals.map((r) => <ReferralRow key={r.id} referral={r} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
