'use client';

import { useMutation, useQuery } from '@apollo/client';
import { MY_REFERRAL, SET_VOUCHER_AUTO_APPLY } from '@/graphql/referrals';
import { InlineError } from '@/components/common/Alert';

/** Whether new rewards are credited on their own or wait for the patient to apply them. Shown on Settings and on Rewards. */
export function VoucherAutoApplyToggle() {
  const { data } = useQuery(MY_REFERRAL, { fetchPolicy: 'cache-and-network' });
  const [setAutoApply, { loading, error }] = useMutation(SET_VOUCHER_AUTO_APPLY);
  const on: boolean | undefined = data?.myReferral?.voucherAutoApply;
  if (on === undefined) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Apply my vouchers automatically</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {on ? 'New rewards are credited to your next payment on their own.' : 'New rewards wait on the Rewards page until you apply them yourself.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Apply my vouchers automatically"
          disabled={loading}
          onClick={() => setAutoApply({ variables: { autoApply: !on } }).catch(() => {})}
          className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative disabled:opacity-50 ${on ? 'bg-ink-700' : 'bg-slate-200'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      <InlineError error={error} size="xs" className="mt-2" />
    </div>
  );
}
