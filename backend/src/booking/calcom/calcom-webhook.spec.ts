import { createHmac } from 'crypto';
import { parseCalcomEvent, verifyCalcomSignature } from './calcom-webhook';

const body = (trigger: string, payload: Record<string, unknown> = {}) => ({
  triggerEvent: trigger,
  createdAt: '2026-10-05T10:00:00.000Z',
  payload: {
    uid: 'bk_1', title: 'Routine appointment between Dr Chen and Sofia Meyer', type: 'routine',
    startTime: '2026-10-07T09:30:00Z', endTime: '2026-10-07T09:45:00Z',
    organizer: { name: 'David Chen', email: 'Doctor@Clinic.dev' },
    attendees: [{ name: 'Sofia Meyer', email: 'sofia.meyer@example.com' }],
    location: 'integrations:daily', metadata: { videoCallUrl: 'https://app.cal.com/video/bk_1', bookingToken: 'v1.a.b' },
    ...payload,
  },
});

describe('verifyCalcomSignature', () => {
  const raw = Buffer.from(JSON.stringify(body('BOOKING_CREATED')));
  const sig = createHmac('sha256', 'whsec').update(raw).digest('hex');

  it('accepts the hex HMAC-SHA256 of the exact bytes', () => {
    expect(verifyCalcomSignature(raw, sig, 'whsec')).toBe(true);
  });
  it('refuses a wrong secret, a changed body, a missing header and an unset secret', () => {
    expect(verifyCalcomSignature(raw, sig, 'other')).toBe(false);
    expect(verifyCalcomSignature(Buffer.concat([raw, Buffer.from(' ')]), sig, 'whsec')).toBe(false);
    expect(verifyCalcomSignature(raw, undefined, 'whsec')).toBe(false);
    expect(verifyCalcomSignature(raw, sig, '')).toBe(false);
    expect(verifyCalcomSignature(raw, 'not-hex', 'whsec')).toBe(false);
  });
});

describe('parseCalcomEvent', () => {
  it('reads a new booking: who, when, the call link and our token', () => {
    expect(parseCalcomEvent(body('BOOKING_CREATED'))).toMatchObject({
      uid: 'bk_1', status: 'CONFIRMED', rescheduledFromUid: null,
      startsAt: new Date('2026-10-07T09:30:00Z'), endsAt: new Date('2026-10-07T09:45:00Z'),
      hostEmail: 'doctor@clinic.dev', attendeeEmail: 'sofia.meyer@example.com',
      meetingUrl: 'https://app.cal.com/video/bk_1', location: 'integrations:daily', eventTypeSlug: 'routine', token: 'v1.a.b',
      sentAt: new Date('2026-10-05T10:00:00.000Z'),
    });
  });

  it('treats a booking that needs the host’s approval as pending', () => {
    expect(parseCalcomEvent(body('BOOKING_CREATED', { status: 'PENDING' }))?.status).toBe('PENDING');
    expect(parseCalcomEvent(body('BOOKING_REQUESTED'))?.status).toBe('PENDING');
  });

  it('links a moved booking to the one it replaces, and carries a cancellation’s reason', () => {
    expect(parseCalcomEvent(body('BOOKING_RESCHEDULED', { uid: 'bk_2', rescheduleUid: 'bk_1' }))).toMatchObject({ uid: 'bk_2', rescheduledFromUid: 'bk_1', status: 'CONFIRMED' });
    expect(parseCalcomEvent(body('BOOKING_CANCELLED', { cancellationReason: 'Feeling better' }))).toMatchObject({ status: 'CANCELLED', cancelReason: 'Feeling better' });
    expect(parseCalcomEvent(body('MEETING_ENDED'))?.status).toBe('COMPLETED');
  });

  it('never passes on a call link that is not https', () => {
    expect(parseCalcomEvent(body('BOOKING_CREATED', { metadata: { videoCallUrl: 'javascript:alert(1)' }, location: 'Clinic, Prishtina' }))).toMatchObject({ meetingUrl: null, location: 'Clinic, Prishtina' });
  });

  it('ignores triggers it does not track, pings and messages without a booking id', () => {
    expect(parseCalcomEvent(body('FORM_SUBMITTED'))).toBeNull();
    expect(parseCalcomEvent({ triggerEvent: 'PING' })).toBeNull();
    expect(parseCalcomEvent(body('BOOKING_CREATED', { uid: '' }))).toBeNull();
    expect(parseCalcomEvent(null)).toBeNull();
  });
});
