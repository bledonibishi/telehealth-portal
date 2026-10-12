'use client';

import { useMutation, useQuery } from '@apollo/client';
import { addDays, format } from 'date-fns';
import { MY_SUPPLY_STATUS, REQUEST_REFILL } from '@/graphql/supply';

/** Why the "order next dose early" button can't be used right now, in the patient's words. */
export function refillHint(s: any): string | null {
  switch (s?.refillState) {
    case 'READY': return null;
    case 'REQUESTED': return 'Requested — your doctor will approve it, then it goes to the pharmacy.';
    case 'NOT_YET': return `You can order from ${format(addDays(new Date(), s.refillOpensInDays), 'd MMM')} (${s.refillOpensInDays === 1 ? 'tomorrow' : `in ${s.refillOpensInDays} days`}), a few days before your supply runs out. Your doctor approves each repeat, so it isn’t sent automatically.`;
    case 'CHECK_IN_FIRST': return 'Complete your check-in first, so your doctor can approve it.';
    case 'IN_REVIEW': return 'Your doctor is reviewing your check-in — your next supply follows from that.';
    case 'NO_REPEATS': return 'No repeats left — your doctor will arrange a new prescription.';
    default: return s?.supplyBeingPrepared ? 'Your next supply is already being prepared.' : 'Available once your first supply has shipped.';
  }
}

/** The patient's next-supply status and the one-tap request, shared by every "order early" button. */
export function useRefill() {
  const { data, loading: loadingStatus } = useQuery(MY_SUPPLY_STATUS, { fetchPolicy: 'cache-and-network' });
  const [mutate, { loading, error }] = useMutation(REQUEST_REFILL, {
    update: (cache, { data: res }) => res && cache.writeQuery({ query: MY_SUPPLY_STATUS, data: { mySupplyStatus: res.requestRefill } }),
  });
  const status = data?.mySupplyStatus ?? null;
  return {
    status,
    loadingStatus,
    canRequest: status?.refillState === 'READY',
    requested: status?.refillState === 'REQUESTED',
    hint: status ? refillHint(status) : null,
    request: () => mutate().catch(() => undefined), // shown from `error`
    loading,
    error,
  };
}
