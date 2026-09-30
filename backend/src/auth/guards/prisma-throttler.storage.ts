import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';

// Counts live in Postgres, so every serverless instance shares one fixed window per key
@Injectable()
export class PrismaThrottlerStorage implements ThrottlerStorage {
  constructor(private prisma: PrismaService) {}

  async increment(key: string, ttl: number, limit: number) {
    const [{ hits, seconds_left }] = await this.prisma.$queryRaw<{ hits: number; seconds_left: number }[]>`
      INSERT INTO throttle_counters (key, hits, expires_at)
      VALUES (${key}, 1, now() + ${ttl}::integer * interval '1 millisecond')
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN throttle_counters.expires_at <= now() THEN 1 ELSE throttle_counters.hits + 1 END,
        expires_at = CASE WHEN throttle_counters.expires_at <= now() THEN EXCLUDED.expires_at ELSE throttle_counters.expires_at END
      RETURNING hits, CEIL(EXTRACT(EPOCH FROM expires_at - now()))::integer AS seconds_left`;
    const isBlocked = hits > limit;
    return { totalHits: hits, timeToExpire: seconds_left, isBlocked, timeToBlockExpire: isBlocked ? seconds_left : 0 };
  }

  async decrement(key: string) {
    await this.prisma.$executeRaw`
      UPDATE throttle_counters SET hits = hits - 1
      WHERE key = ${key} AND hits > 0 AND expires_at > now()`;
  }
}
