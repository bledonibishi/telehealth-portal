import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest();

/**
 * Throws unless `authorization` is the bearer token Vercel Cron attaches when CRON_SECRET is set. Both sides are
 * hashed first so the comparison takes the same time whatever was sent, and whatever its length.
 */
export function assertCronAuth(authorization: string | undefined, secret: string | undefined): void {
  if (!secret || !crypto.timingSafeEqual(sha256(authorization ?? ''), sha256(`Bearer ${secret}`))) {
    throw new UnauthorizedException();
  }
}
