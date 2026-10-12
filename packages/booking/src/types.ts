export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED' | 'REJECTED' | 'COMPLETED';

export interface Booking {
  id: string;
  uid: string;
  purpose: string;
  referenceId?: string | null;
  status: BookingStatus;
  title?: string | null;
  startsAt: string;
  endsAt: string;
  meetingUrl?: string | null;
  location?: string | null;
  hostName?: string | null;
  cancelReason?: string | null;
  /** The patient can still move it: fetch a session with `useReschedule(uid)` and hand it to <BookingScheduler>. */
  canReschedule: boolean;
}

export interface BookingSession {
  purpose: string;
  label: string;
  calLink: string;
  calOrigin?: string | null;
  name: string;
  email: string;
  token: string;
  /** A short line for the host (e.g. "Reason: Side effect"), prefilled as the booking's notes. */
  notes?: string | null;
  /** Set when the session moves an existing booking instead of making a new one. */
  rescheduleUid?: string | null;
  current?: Booking | null;
}

/** What the scheduler reports the moment a time is picked (before our own record of it has arrived). */
export interface PickedTime {
  uid?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
}
