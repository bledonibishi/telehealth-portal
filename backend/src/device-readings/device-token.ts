import { createHash, randomBytes } from 'crypto';

// A device token is a long random secret the patient's app or scale presents instead of a login.
// Only its hash is stored, so a leaked database does not leak working tokens.

export const DEVICE_TOKEN_PREFIX = 'thd_';

export const newDeviceToken = () => DEVICE_TOKEN_PREFIX + randomBytes(32).toString('base64url');
export const hashDeviceToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const tokenHint = (token: string) => token.slice(-4);

/** The token from an `Authorization: Bearer …` header, if it is shaped like a device token. */
export function deviceTokenFrom(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  const token = match?.[1];
  return token && token.startsWith(DEVICE_TOKEN_PREFIX) && token.length <= 200 ? token : null;
}
