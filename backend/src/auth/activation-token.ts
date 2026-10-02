import * as crypto from 'crypto';

export const ACTIVATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newActivationToken() {
  return {
    activationToken: crypto.randomBytes(32).toString('hex'),
    activationTokenExpiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS),
  };
}
