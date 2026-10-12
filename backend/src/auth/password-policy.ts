import { BadRequestException } from '@nestjs/common';

export const PASSWORD_MIN = 10;
// bcrypt ignores everything past 72 bytes, so a longer password would silently be a shorter one.
export const PASSWORD_MAX = 72;
export const BCRYPT_ROUNDS = 12;

const COMMON = new Set(['password12', 'password123', 'password1234', '1234567890', '12345678910', 'qwertyuiop', 'qwerty12345', 'iloveyou123', 'welcome123', 'letmein1234']);

/** One place for the rules every way of choosing a password goes through. */
export function assertAcceptablePassword(password: string, email?: string) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || Buffer.byteLength(password) > PASSWORD_MAX) {
    throw new BadRequestException(`Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`);
  }
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password) || (email && lower === email.trim().toLowerCase())) {
    throw new BadRequestException('That password is too easy to guess. Choose a different one');
  }
}
