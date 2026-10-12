import { createHmac, timingSafeEqual } from 'crypto';
import { BookingStatus } from '@prisma/client';

// Reading what Cal.com tells us: checking it really came from Cal.com, and turning its payload into the
// few fields the booking system keeps. Pure, so it can be tested against recorded payloads.

/** Cal.com signs the exact bytes it sent with the webhook's secret (hex HMAC-SHA256, header `x-cal-signature-256`). */
export function verifyCalcomSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(signature.trim().replace(/^sha256=/, ''), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** What each Cal.com trigger means for the booking's status. Triggers not listed are acknowledged and ignored. */
const STATUS_OF: Record<string, BookingStatus> = {
  BOOKING_CREATED: 'CONFIRMED',
  BOOKING_REQUESTED: 'PENDING',
  BOOKING_RESCHEDULED: 'CONFIRMED',
  BOOKING_CANCELLED: 'CANCELLED',
  BOOKING_REJECTED: 'REJECTED',
  MEETING_ENDED: 'COMPLETED',
};

export interface ProviderBookingEvent {
  trigger: string;
  uid: string;
  status: BookingStatus;
  /** The booking this one replaces, on a reschedule. */
  rescheduledFromUid: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  title: string | null;
  attendeeName: string | null;
  attendeeEmail: string | null;
  hostName: string | null;
  hostEmail: string | null;
  meetingUrl: string | null;
  location: string | null;
  cancelReason: string | null;
  /** The provider's event-type slug, e.g. "routine-appointment". */
  eventTypeSlug: string | null;
  /** "<host>/<event-type-slug>": what the scheduler opens to move this booking. */
  eventLink: string | null;
  /** When the booking was made, when known — a token is judged against this, not against when we heard of it. */
  bookedAt: Date | null;
  /** The signed token the portal attached when the patient booked from it. */
  token: string | null;
  /** When the provider sent this; an older message must not overwrite a newer one. */
  sentAt: Date;
}

export const str = (v: unknown, max = 300): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
export const date = (v: unknown): Date | null => {
  const d = typeof v === 'string' || typeof v === 'number' ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
export const httpsUrl = (v: unknown): string | null => {
  const s = str(v, 500);
  return s && /^https:\/\//i.test(s) ? s : null;
};

/** Null when the message is not about a booking we track (another trigger, a ping, or no booking id). */
export function parseCalcomEvent(body: any): ProviderBookingEvent | null {
  const trigger = str(body?.triggerEvent);
  const p = body?.payload;
  const uid = str(p?.uid);
  if (!trigger || !(trigger in STATUS_OF) || !uid) return null;

  const attendee = Array.isArray(p.attendees) ? p.attendees[0] : null;
  // A booking that needs the host's approval arrives as "created" but is still pending.
  const status = trigger === 'BOOKING_CREATED' && String(p.status).toUpperCase() === 'PENDING' ? 'PENDING' : STATUS_OF[trigger];
  const location = str(p.location, 500);
  return {
    trigger,
    uid,
    status,
    rescheduledFromUid: trigger === 'BOOKING_RESCHEDULED' ? str(p.rescheduleUid) : null,
    startsAt: date(p.startTime),
    endsAt: date(p.endTime),
    title: str(p.title),
    attendeeName: str(attendee?.name),
    attendeeEmail: str(attendee?.email)?.toLowerCase() ?? null,
    hostName: str(p.organizer?.name),
    hostEmail: str(p.organizer?.email)?.toLowerCase() ?? null,
    meetingUrl: httpsUrl(p.metadata?.videoCallUrl) ?? httpsUrl(p.videoCallData?.url) ?? httpsUrl(location),
    location: location && !/^https?:\/\//i.test(location) ? location : null,
    cancelReason: str(p.cancellationReason ?? p.rejectionReason, 500),
    eventTypeSlug: str(p.type),
    eventLink: str(p.organizer?.username) && str(p.type) ? `${str(p.organizer.username)}/${str(p.type)}` : null,
    bookedAt: trigger === 'BOOKING_CREATED' || trigger === 'BOOKING_REQUESTED' ? (date(body.createdAt) ?? null) : null,
    token: str(p.metadata?.bookingToken, 600),
    sentAt: date(body.createdAt) ?? new Date(),
  };
}
