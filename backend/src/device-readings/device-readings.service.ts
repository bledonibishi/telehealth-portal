import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertValidWeight, MAX_WEIGHT_KG, MIN_WEIGHT_KG, WeightJourneyService } from '../weight-journey/weight-journey.service';
import { round1 } from '../weight-journey/weight-math';
import { hashDeviceToken } from './device-token';

export const MAX_READINGS_PER_REQUEST = 100;
/** Per connection per rolling 24 hours: far above any real scale or app, a guard against a runaway client. */
export const MAX_READINGS_PER_DAY = 500;
const FUTURE_SLACK_MS = 5 * 60_000;
const MAX_BACKDATE_YEARS = 5;
const LB_PER_KG = 2.2046226218;
/** Don't write "last used" on every request. */
const LAST_USED_EVERY_MS = 5 * 60_000;

export interface IncomingReading {
  /** The device's own id for this reading, so sending it again records it once. */
  externalId?: unknown;
  weight?: unknown;
  /** "kg" (default) or "lb". */
  unit?: unknown;
  /** ISO 8601 date-time of the weighing. */
  measuredAt?: unknown;
}

export interface IngestResult {
  accepted: number;
  duplicates: number;
  rejected: Array<{ index: number; externalId?: string; reason: string }>;
}

export interface DeviceAuth {
  connectionId: string;
  patientId: string;
}

@Injectable()
export class DeviceReadingsService {
  constructor(
    private prisma: PrismaService,
    private journey: WeightJourneyService,
  ) {}

  /** Who a device token belongs to, or a 401 — the same answer for an unknown, revoked or malformed token. */
  async authenticate(token: string | null): Promise<DeviceAuth> {
    if (!token) throw new UnauthorizedException('Missing or invalid device token');
    const connection = await this.prisma.deviceConnection.findUnique({ where: { tokenHash: hashDeviceToken(token) } });
    if (!connection || connection.revokedAt) throw new UnauthorizedException('Missing or invalid device token');

    if (!connection.lastUsedAt || Date.now() - connection.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
      await this.prisma.deviceConnection.update({ where: { id: connection.id }, data: { lastUsedAt: new Date() } });
    }
    return { connectionId: connection.id, patientId: connection.patientId };
  }

  /** Records a batch of weights from a device. Every reading is checked on its own; one bad one doesn't sink the rest. */
  async ingest(auth: DeviceAuth, readings: IncomingReading[]): Promise<IngestResult> {
    try {
      await this.journey.requireGlp1(auth.patientId);
    } catch {
      throw new ForbiddenException('Weight tracking isn’t part of this patient’s programme');
    }

    const result: IngestResult = { accepted: 0, duplicates: 0, rejected: [] };
    const today = await this.prisma.weightEntry.count({
      where: { deviceConnectionId: auth.connectionId, recordedAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    let budget = Math.max(MAX_READINGS_PER_DAY - today, 0);

    for (const [index, raw] of readings.entries()) {
      const externalId = typeof raw?.externalId === 'string' ? raw.externalId.trim() : '';
      const reject = (reason: string) => result.rejected.push({ index, ...(externalId && { externalId }), reason });

      const checked = this.validate(raw);
      if ('error' in checked) { reject(checked.error); continue; }
      if (budget <= 0) { reject('Too many readings today — try again tomorrow'); continue; }

      try {
        await this.prisma.weightEntry.create({
          data: {
            patientId: auth.patientId,
            weightKg: checked.weightKg,
            measuredAt: checked.measuredAt,
            source: 'DEVICE',
            deviceConnectionId: auth.connectionId,
            externalId: checked.externalId,
          },
        });
        result.accepted++;
        budget--;
      } catch (e: any) {
        // The same reading arriving again (a retry, or a re-sync): already saved, so nothing to do.
        if (e?.code === 'P2002') result.duplicates++;
        else throw e;
      }
    }
    return result;
  }

  private validate(raw: IncomingReading): { weightKg: number; measuredAt: Date; externalId: string } | { error: string } {
    if (!raw || typeof raw !== 'object') return { error: 'Not a reading' };
    const externalId = typeof raw.externalId === 'string' ? raw.externalId.trim() : '';
    if (!externalId || externalId.length > 100) return { error: 'externalId is required (up to 100 characters)' };

    const unit = raw.unit === undefined ? 'kg' : raw.unit;
    if (unit !== 'kg' && unit !== 'lb') return { error: 'unit must be "kg" or "lb"' };
    if (typeof raw.weight !== 'number' || !Number.isFinite(raw.weight)) return { error: 'weight must be a number' };
    const weightKg = round1(unit === 'lb' ? raw.weight / LB_PER_KG : raw.weight);
    try {
      assertValidWeight(weightKg, 'Weight');
    } catch {
      return { error: `weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg` };
    }

    if (typeof raw.measuredAt !== 'string') return { error: 'measuredAt must be an ISO 8601 date-time' };
    const measuredAt = new Date(raw.measuredAt);
    if (Number.isNaN(measuredAt.getTime())) return { error: 'measuredAt must be an ISO 8601 date-time' };
    const now = Date.now();
    if (measuredAt.getTime() > now + FUTURE_SLACK_MS) return { error: 'measuredAt can’t be in the future' };
    if (measuredAt.getTime() < now - MAX_BACKDATE_YEARS * 365 * 86_400_000) return { error: `measuredAt can’t be more than ${MAX_BACKDATE_YEARS} years ago` };

    return { weightKg, measuredAt, externalId };
  }
}
