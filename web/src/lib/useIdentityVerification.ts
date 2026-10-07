'use client';

import { useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { MY_IDENTITY_VERIFICATION } from '@/graphql/onboarding';

const POLL_MS = 8000;
/** Not decided yet: keep checking. APPROVED, REJECTED and EXPIRED are final for this session. */
export const OPEN_STATUSES = ['PENDING', 'PROCESSING', 'NEEDS_REVIEW'];

/**
 * The patient's identity-check status, kept current while it is still open. It polls on a timer, and
 * also refreshes the moment the patient returns to this tab: the check happens in another tab, and
 * browsers slow background timers right down, so a timer alone can leave this page stale.
 */
export function useIdentityVerification() {
  const query = useQuery(MY_IDENTITY_VERIFICATION, { fetchPolicy: 'network-only' });
  const { data, refetch, startPolling, stopPolling } = query;
  const idv = data?.myIdentityVerification;
  const open = !!idv?.configured && OPEN_STATUSES.includes(idv.status ?? '');

  useEffect(() => {
    if (!open) return;
    startPolling(POLL_MS);
    return () => stopPolling();
  }, [open, startPolling, stopPolling]);

  useEffect(() => {
    if (!open) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('focus', refreshIfVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('focus', refreshIfVisible);
    };
  }, [open, refetch]);

  return query;
}
