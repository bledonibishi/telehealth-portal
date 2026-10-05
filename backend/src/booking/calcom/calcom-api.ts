import { BookingStatus } from '@prisma/client';
import { type ProviderBookingEvent, date, httpsUrl, str } from './calcom-webhook';

// Reading a booking as Cal.com's API returns it (GET /v2/bookings), into the same shape a webhook gives us,
// so both ways of hearing about a booking are applied by the same code.

const STATUS_OF: Record<string, BookingStatus> = { accepted: 'CONFIRMED', pending: 'PENDING', awaiting_host: 'PENDING', cancelled: 'CANCELLED', rejected: 'REJECTED' };

/**
 * Null when it isn't a booking we can use (no id, an unknown status, no times). `now` stamps it as the
 * newest thing known: what the API says is the present state, whatever earlier messages said.
 */
export function snapshotOf(b: any, now = new Date()): ProviderBookingEvent | null {
  const uid = str(b?.uid);
  const known = STATUS_OF[String(b?.status).toLowerCase()];
  const startsAt = date(b?.start), endsAt = date(b?.end);
  if (!uid || !known || !startsAt || !endsAt) return null;

  const host = Array.isArray(b.hosts) ? b.hosts[0] : null;
  const attendee = Array.isArray(b.attendees) ? b.attendees[0] : null;
  const location = str(b.location, 500);
  // A booking that was moved stays "accepted" at the provider; the newer booking is what holds the time.
  const status: BookingStatus = str(b.rescheduledToUid) && known !== 'CANCELLED' ? 'RESCHEDULED' : known === 'CONFIRMED' && endsAt < now ? 'COMPLETED' : known;
  return {
    trigger: 'API_SNAPSHOT',
    uid,
    status,
    rescheduledFromUid: str(b.rescheduledFromUid),
    startsAt,
    endsAt,
    title: str(b.title),
    attendeeName: str(attendee?.name),
    attendeeEmail: str(attendee?.email)?.toLowerCase() ?? null,
    hostName: str(host?.name),
    hostEmail: str(host?.email)?.toLowerCase() ?? null,
    meetingUrl: httpsUrl(b.meetingUrl) ?? httpsUrl(location),
    location: location && !/^https?:\/\//i.test(location) ? location : null,
    cancelReason: str(b.cancellationReason, 500),
    eventTypeSlug: str(b.eventType?.slug),
    eventLink: str(host?.username) && str(b.eventType?.slug) ? `${str(host.username)}/${str(b.eventType.slug)}` : null,
    token: str(b.metadata?.bookingToken, 600),
    bookedAt: date(b.createdAt),
    sentAt: now,
  };
}
