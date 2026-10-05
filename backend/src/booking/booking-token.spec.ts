import { BOOKING_TOKEN_TTL_MS, MAX_TOKEN_LENGTH, signBookingToken, verifyBookingToken } from './booking-token';
import { calLinkOf } from './booking-purposes';

const NOW = Date.parse('2026-10-05T10:00:00Z');
const claims = { patientId: 'cmuv5bjj60029ycr8rvtrsv68', purpose: 'APPOINTMENT_ROUTINE', referenceId: 'cmuv5embn000i6afae53h6s9j' };

describe('booking token', () => {
  it('round-trips the claims and fits the provider’s metadata limit', () => {
    const token = signBookingToken(claims, 's3cret', NOW);
    expect(token.length).toBeLessThanOrEqual(MAX_TOKEN_LENGTH);
    expect(verifyBookingToken(token, 's3cret', NOW + 1000)).toEqual(claims);
    expect(verifyBookingToken(signBookingToken({ patientId: 'p', purpose: 'GENERAL' }, 's', NOW), 's', NOW)).toEqual({ patientId: 'p', purpose: 'GENERAL', referenceId: null });
  });

  it('rejects a token that was altered, signed with another secret, expired or not a token', () => {
    const token = signBookingToken(claims, 's3cret', NOW);
    const [v, body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ p: 'someone-else', u: claims.purpose, e: NOW + 1e9 })).toString('base64url');
    expect(verifyBookingToken(`${v}.${forged}.${sig}`, 's3cret', NOW)).toBeNull();
    expect(verifyBookingToken(token, 'other', NOW)).toBeNull();
    expect(verifyBookingToken(token, 's3cret', NOW + BOOKING_TOKEN_TTL_MS + 1)).toBeNull();
    expect(verifyBookingToken(`${v}.${body}`, 's3cret', NOW)).toBeNull();
    expect(verifyBookingToken(undefined, 's3cret', NOW)).toBeNull();
  });
});

describe('calLinkOf', () => {
  it('accepts a user/event or team/event link, however it was pasted', () => {
    expect(calLinkOf('clinic/routine')).toBe('clinic/routine');
    expect(calLinkOf(' https://cal.com/team/clinic/urgent-15/ ')).toBe('team/clinic/urgent-15');
  });
  it('refuses anything that is not a plain event path', () => {
    expect(calLinkOf('')).toBeNull();
    expect(calLinkOf('clinic')).toBeNull();
    expect(calLinkOf('clinic/routine?redirect=https://evil.example')).toBeNull();
  });
});
