'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { BOOKING_SESSION, CANCEL_MY_BOOKING, MY_BOOKINGS } from './graphql';
import type { Booking, BookingSession, PickedTime } from './types';

/** After a time is picked, how often and how long to look for our own record of it (it arrives by webhook). */
const CONFIRM_POLL_MS = 2_000;
const CONFIRM_GIVE_UP_MS = 30_000;

export interface UseBooking {
  /** Null while loading, and when scheduling isn't set up for this purpose — fall back to whatever you did before. */
  session: BookingSession | null;
  /** The patient's live booking for this purpose and reference, if they have one. */
  current: Booking | null;
  loading: boolean;
  error?: Error;
  /** A time was just picked and we are waiting for our record of it; `picked` has what the scheduler reported. */
  confirming: boolean;
  picked: PickedTime | null;
  /** Hand to <BookingScheduler onPicked>. */
  onPicked: (time: PickedTime) => void;
  cancel: (reason?: string) => Promise<void>;
  cancelling: boolean;
  refetch: () => void;
}

/**
 * Everything a screen needs to offer a booking: the session for <BookingScheduler>, the booking the patient
 * already has, cancelling it, and the short wait between picking a time and our record of it arriving.
 *
 *   const booking = useBooking('APPOINTMENT_ROUTINE', request.id);
 *   if (booking.current) …show it…  else if (booking.session) <BookingScheduler session={booking.session} onPicked={booking.onPicked} />
 */
export function useBooking(purpose: string, referenceId?: string | null, opts: { skip?: boolean; onChange?: (current: Booking | null) => void } = {}): UseBooking {
  const { data, loading, error, refetch, startPolling, stopPolling } = useQuery(BOOKING_SESSION, {
    variables: { purpose, referenceId: referenceId ?? null },
    skip: opts.skip,
    fetchPolicy: 'cache-and-network',
  });
  const [cancelMutation, { loading: cancelling }] = useMutation(CANCEL_MY_BOOKING, { refetchQueries: [{ query: MY_BOOKINGS }] });
  const [picked, setPicked] = useState<PickedTime | null>(null);
  const [confirming, setConfirming] = useState(false);

  const session: BookingSession | null = data?.bookingSession ?? null;
  const current: Booking | null = session?.current ?? null;

  const onChange = useRef(opts.onChange);
  onChange.current = opts.onChange;
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (loading) return;
    const key = current ? `${current.uid}:${current.status}:${current.startsAt}` : null;
    if (seen.current !== undefined && seen.current !== key) onChange.current?.(current);
    seen.current = key;
  }, [current, loading]);

  // Picking a time is done once the scheduler says so, but the app only believes its own record.
  useEffect(() => {
    if (!confirming) return;
    if (current && (!picked?.uid || current.uid === picked.uid)) {
      setConfirming(false);
      return;
    }
    startPolling(CONFIRM_POLL_MS);
    const giveUp = setTimeout(() => setConfirming(false), CONFIRM_GIVE_UP_MS);
    return () => {
      stopPolling();
      clearTimeout(giveUp);
    };
  }, [confirming, current, picked, startPolling, stopPolling]);

  const onPicked = useCallback((time: PickedTime) => {
    setPicked(time);
    setConfirming(true);
  }, []);

  const cancel = useCallback(
    async (reason?: string) => {
      if (!current) return;
      await cancelMutation({ variables: { uid: current.uid, reason } });
      setPicked(null);
      await refetch();
    },
    [current, cancelMutation, refetch],
  );

  return { session, current, loading, error, confirming, picked, onPicked, cancel, cancelling, refetch: () => void refetch() };
}
