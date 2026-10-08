import { useMutation, useQuery } from '@apollo/client';
import { MY_SUPPLY_STATUS, REQUEST_REFILL } from '../graphql/operations';

/** Why "order next dose early" can't be used right now, in the patient's words (the same as the web portal). */
export function refillHint(s: any): string | null {
  switch (s?.refillState) {
    case 'READY': return null;
    case 'REQUESTED': return 'Requested — your doctor will approve it, then it goes to the pharmacy.';
    case 'NOT_YET': return `You can order ${s.refillOpensInDays === 1 ? 'tomorrow' : `in ${s.refillOpensInDays} days`}, a few days before your supply runs out.`;
    case 'CHECK_IN_FIRST': return 'Complete your monthly check-in first, so your doctor can approve it.';
    case 'IN_REVIEW': return 'Your doctor is reviewing your check-in — your next supply follows from that.';
    case 'NO_REPEATS': return 'No repeats left — your doctor will arrange a new prescription.';
    default: return s?.supplyBeingPrepared ? 'Your next supply is already being prepared.' : 'Available once your first supply has shipped.';
  }
}

/** The patient's next-supply status and the one-tap request. */
export function useRefill() {
  const { data, refetch } = useQuery(MY_SUPPLY_STATUS, { fetchPolicy: 'cache-and-network' });
  const [mutate, { loading, error }] = useMutation(REQUEST_REFILL, {
    update: (cache, { data: res }) => res && cache.writeQuery({ query: MY_SUPPLY_STATUS, data: { mySupplyStatus: res.requestRefill } }),
  });
  const status = data?.mySupplyStatus ?? null;
  return {
    status,
    refetch,
    canRequest: status?.refillState === 'READY',
    requested: status?.refillState === 'REQUESTED',
    hint: status ? refillHint(status) : null,
    request: () => mutate().catch(() => undefined),
    loading,
    error,
  };
}
