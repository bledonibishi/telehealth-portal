import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@apollo/client';
import { MY_IDENTITY_VERIFICATION } from '../graphql/onboarding';

const POLL_MS = 8000;
/** Not decided yet: keep checking. APPROVED, REJECTED and EXPIRED are final for this session. */
export const OPEN_STATUSES = ['PENDING', 'PROCESSING', 'NEEDS_REVIEW'];
/** The photos have been sent: the step is done, whether or not a decision has been made yet. */
export const SUBMITTED_STATUSES = ['PROCESSING', 'NEEDS_REVIEW', 'APPROVED'];

/**
 * The patient's identity-check status, kept current while it is still open: polled on a timer, and
 * refreshed the moment the app comes back to the front — the check itself happens in a browser.
 * Mirrors web/src/lib/useIdentityVerification.ts.
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
    const sub = AppState.addEventListener('change', (state) => state === 'active' && void refetch());
    return () => sub.remove();
  }, [open, refetch]);

  return query;
}

/** One line on where the check stands, for the onboarding checklist. */
export function identityHint(status: string | null | undefined): string {
  if (status === 'APPROVED') return 'Identity verified';
  if (status === 'PROCESSING' || status === 'NEEDS_REVIEW') return 'We’re checking your ID';
  if (status === 'REJECTED') return 'We couldn’t verify your ID: please try again';
  if (status === 'EXPIRED') return 'Your link expired: start again';
  return 'Check your Kosovo ID card and take a selfie';
}
