'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { CANCEL_MY_BOOKING, MY_BOOKINGS, RESCHEDULE_SESSION } from './graphql';
import type { Booking, BookingSession } from './types';

const IDLE_POLL_MS = 60_000;
/** Right after a time is picked or moved, look often for a short while: the provider takes a moment to show it. */
const SETTLE_POLL_MS = 2_500;
const SETTLE_FOR_MS = 25_000;

export interface UseMyBookings {
  /** The patient's upcoming bookings, soonest first — read from the scheduling provider each time, not just our copy. */
  bookings: Booking[];
  loading: boolean;
  error?: Error;
  cancel: (uid: string, reason?: string) => Promise<void>;
  /** The uid being cancelled, if one is. */
  cancelling: string | null;
  /** Call when something was just booked or moved, so the list catches up quickly. */
  settle: () => void;
  settling: boolean;
  refetch: () => void;
}

/** The signed-in patient's real appointments, with cancelling. Pair with `useReschedule` to move one. */
export function useMyBookings(opts: { onChange?: () => void } = {}): UseMyBookings {
  const [settling, setSettling] = useState(false);
  const { data, loading, error, refetch } = useQuery(MY_BOOKINGS, { fetchPolicy: 'cache-and-network', pollInterval: settling ? SETTLE_POLL_MS : IDLE_POLL_MS });
  const [cancelMutation] = useMutation(CANCEL_MY_BOOKING);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const bookings: Booking[] = data?.myBookings ?? [];

  useEffect(() => {
    if (!settling) return;
    const t = setTimeout(() => setSettling(false), SETTLE_FOR_MS);
    return () => clearTimeout(t);
  }, [settling]);

  // Tell the caller whenever the set of bookings changes, so screens built on them (e.g. requests) can refresh.
  const key = bookings.map((b) => `${b.uid}:${b.status}:${b.startsAt}`).join('|');
  const { onChange } = opts;
  useEffect(() => {
    if (!loading) onChange?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const cancel = useCallback(
    async (uid: string, reason?: string) => {
      setCancelling(uid);
      try {
        await cancelMutation({ variables: { uid, reason } });
        await refetch();
      } finally {
        setCancelling(null);
      }
    },
    [cancelMutation, refetch],
  );

  return { bookings, loading, error, cancel, cancelling, settle: () => setSettling(true), settling, refetch: () => void refetch() };
}

/** Fetches, on demand, the session that opens the scheduler on one booking to move it. */
export function useReschedule() {
  const [load, { data, loading, error }] = useLazyQuery(RESCHEDULE_SESSION, { fetchPolicy: 'network-only' });
  const [uid, setUid] = useState<string | null>(null);
  const session: BookingSession | null = uid && data?.rescheduleSession?.rescheduleUid === uid ? data.rescheduleSession : null;
  return {
    /** The booking being moved, or null. */
    uid,
    session,
    loading,
    error,
    /** True once we asked and the booking turned out not to be movable any more. */
    unavailable: !!uid && !loading && !!data && !data.rescheduleSession,
    start: (bookingUid: string) => {
      setUid(bookingUid);
      void load({ variables: { uid: bookingUid } });
    },
    stop: () => setUid(null),
  };
}
