import { createHmac, timingSafeEqual } from 'crypto';

// The scheduler runs in the patient's browser, so anything it sends along with a booking could be forged.
// What a booking is for, and whose it is, therefore travels as a token the server signed: the webhook only
// trusts a patient id, purpose or reference that comes out of a valid one.

export interface BookingClaims {
  patientId: string;
  purpose: string;
  referenceId?: string | null;
}

/** Long enough to pick a time in an open tab; a reschedule inherits the claims from the booking it replaces. */
export const BOOKING_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
/** The provider caps metadata values; a token must fit. */
export const MAX_TOKEN_LENGTH = 500;

const b64 = (b: Buffer) => b.toString('base64url');
const mac = (body: string, secret: string) => createHmac('sha256', `booking-token:${secret}`).update(body).digest();

export function signBookingToken(claims: BookingClaims, secret: string, now = Date.now()): string {
  const body = b64(Buffer.from(JSON.stringify({ p: claims.patientId, u: claims.purpose, r: claims.referenceId ?? undefined, e: now + BOOKING_TOKEN_TTL_MS })));
  const token = `v1.${body}.${b64(mac(body, secret))}`;
  if (token.length > MAX_TOKEN_LENGTH) throw new Error('Booking token is too long for the scheduling provider');
  return token;
}

/** The claims, or null when the token is missing, altered, signed with another secret, or expired. */
export function verifyBookingToken(token: unknown, secret: string, now = Date.now()): BookingClaims | null {
  if (typeof token !== 'string') return null;
  const [version, body, sig] = token.split('.');
  if (version !== 'v1' || !body || !sig) return null;
  const expected = mac(body, secret);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof c.p !== 'string' || typeof c.u !== 'string' || typeof c.e !== 'number' || c.e < now) return null;
    return { patientId: c.p, purpose: c.u, referenceId: typeof c.r === 'string' ? c.r : null };
  } catch {
    return null;
  }
}
