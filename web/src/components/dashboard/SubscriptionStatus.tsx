'use client';

import { useQuery } from '@apollo/client';
import { MY_SUPPLY_STATUS } from '@/graphql/supply';

/** A small green line under the greeting: the subscription is live, and when the next supply is due. */
export function SubscriptionStatus() {
  const { data } = useQuery(MY_SUPPLY_STATUS, { fetchPolicy: 'cache-and-network' });
  const s = data?.mySupplyStatus;
  if (!s?.subscriptionActive) return null;

  const days: number | null | undefined = s.daysUntilNextSupply;
  const next = s.supplyBeingPrepared
    ? 'your supply is being prepared'
    : days === null || days === undefined
      ? null
      : days > 1 ? `next supply in ${days} days` : days === 1 ? 'next supply tomorrow' : 'next supply is due now';

  return (
    <p className="inline-flex items-center gap-2 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-3 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-brand-600" aria-hidden />
      Subscription active{next && <span className="font-normal text-brand-700/80">· {next}</span>}
    </p>
  );
}
