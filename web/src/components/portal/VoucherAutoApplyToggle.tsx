'use client';

import { useMutation, useQuery } from '@apollo/client';
import { MY_REFERRAL, SET_VOUCHER_AUTO_APPLY } from '@/graphql/referrals';
import { InlineError } from '@/components/common/Alert';

const CHOICES: Array<[boolean, string, string]> = [
  [true, 'Take it off my next payment', 'Nothing to do: each reward is used on your next payment as soon as you earn it.'],
  [false, 'Keep it until I choose', 'Rewards wait on the Refer & earn page. Press “Use now” on one when you want it.'],
];

/** What happens to a reward when it is earned: used on the next payment, or kept for the patient to use. Shown on Rewards and on Billing. */
export function VoucherAutoApplyToggle() {
  const { data } = useQuery(MY_REFERRAL, { fetchPolicy: 'cache-and-network' });
  const [setAutoApply, { loading, error }] = useMutation(SET_VOUCHER_AUTO_APPLY);
  const on: boolean | undefined = data?.myReferral?.voucherAutoApply;
  if (on === undefined) return null;

  return (
    <fieldset disabled={loading}>
      <legend className="text-sm font-semibold text-ink-900">When you earn a reward</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {CHOICES.map(([value, label, hint]) => {
          const picked = on === value;
          return (
            <label
              key={label}
              className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${picked ? 'border-ink-600 bg-ink-50/60 ring-1 ring-ink-600' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <input
                type="radio"
                name="voucher-auto-apply"
                checked={picked}
                onChange={() => setAutoApply({ variables: { autoApply: value } }).catch(() => {})}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-ink-700"
              />
              <span>
                <span className="block text-sm font-semibold text-ink-900">
                  {label}
                  {value && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Recommended</span>}
                </span>
                <span className="mt-1 block text-sm text-slate-500">{hint}</span>
              </span>
            </label>
          );
        })}
      </div>
      <InlineError error={error} size="xs" className="mt-2" />
    </fieldset>
  );
}
