import * as crypto from 'crypto';

export const PASSWORD_RESET_TTL_MINUTES = 60;

export function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** The token goes in the email; only its hash is stored. */
export function newPasswordResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000) };
}
