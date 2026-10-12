import { snapshotOf } from './calcom-api';

const NOW = new Date('2026-10-05T13:00:00Z');
// The shape Cal.com's GET /v2/bookings returned for a real booking made from the portal.
const booking = (over: Record<string, unknown> = {}) => ({
  uid: '9qkkVK3M', status: 'accepted', title: 'Routine appointment between Partin Jashari and Amelia Davis',
  start: '2026-10-06T07:45:00.000Z', end: '2026-10-06T08:00:00.000Z',
  hosts: [{ name: 'Partin Jashari', email: 'Host@Example.com', username: 'partin-jashari' }],
  attendees: [{ name: 'Amelia Davis', email: 'Amelia@Example.com' }],
  meetingUrl: 'https://app.cal.com/video/9qkkVK3M', location: 'https://app.cal.com/video/9qkkVK3M',
  eventType: { id: 1, slug: 'routine-appointment' }, metadata: { bookingToken: 'v1.a.b' },
  cancellationReason: '', createdAt: '2026-10-05T12:54:18.222Z', updatedAt: '2026-10-05T12:54:18.709Z', ...over,
});

describe('snapshotOf', () => {
  it('reads an upcoming booking, with the event it was booked on and when it was made', () => {
    expect(snapshotOf(booking(), NOW)).toMatchObject({
      uid: '9qkkVK3M', status: 'CONFIRMED', startsAt: new Date('2026-10-06T07:45:00Z'), attendeeEmail: 'amelia@example.com', hostEmail: 'host@example.com',
      meetingUrl: 'https://app.cal.com/video/9qkkVK3M', location: null, eventTypeSlug: 'routine-appointment', eventLink: 'partin-jashari/routine-appointment',
      token: 'v1.a.b', cancelReason: null, bookedAt: new Date('2026-10-05T12:54:18.222Z'), sentAt: NOW,
    });
  });

  it('maps the provider’s statuses, and sees a past booking as completed and a moved one as rescheduled', () => {
    expect(snapshotOf(booking({ status: 'cancelled', cancellationReason: 'Away' }), NOW)).toMatchObject({ status: 'CANCELLED', cancelReason: 'Away' });
    expect(snapshotOf(booking({ status: 'pending' }), NOW)?.status).toBe('PENDING');
    expect(snapshotOf(booking({ status: 'rejected' }), NOW)?.status).toBe('REJECTED');
    expect(snapshotOf(booking(), new Date('2026-10-06T09:00:00Z'))?.status).toBe('COMPLETED');
    expect(snapshotOf(booking({ rescheduledToUid: 'newer' }), NOW)?.status).toBe('RESCHEDULED');
    expect(snapshotOf(booking({ uid: 'newer', rescheduledFromUid: '9qkkVK3M' }), NOW)).toMatchObject({ status: 'CONFIRMED', rescheduledFromUid: '9qkkVK3M' });
  });

  it('is null for anything it cannot use', () => {
    expect(snapshotOf(booking({ status: 'weird' }), NOW)).toBeNull();
    expect(snapshotOf(booking({ start: null }), NOW)).toBeNull();
    expect(snapshotOf(null, NOW)).toBeNull();
  });
});
