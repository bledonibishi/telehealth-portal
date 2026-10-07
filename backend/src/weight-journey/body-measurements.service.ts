import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { WeightJourneyService } from './weight-journey.service';
import { AddBodyMeasurementInput } from './dto/body-measurement.input';
import { BodyMeasurementModel } from './models/body-measurement.model';
import { round1 } from './weight-math';

export const WAIST_CM = { min: 30, max: 250 };
export const HIPS_CM = { min: 40, max: 250 };
export const ARM_CM = { min: 10, max: 100 };

// Same rules as a weighing: back-dated is fine, made-up-in-advance is not.
const FUTURE_SLACK_MS = 5 * 60_000;
const MAX_BACKDATE_YEARS = 5;
// Per patient per rolling 24h — far above real use, a guard against a runaway client.
const MAX_ENTRIES_PER_DAY = 50;
export const LIST_LIMIT = 200;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function checked(value: number | null | undefined, label: string, range: { min: number; max: number }): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) throw new BadRequestException(`Please enter a valid ${label}`);
  const cm = round1(value);
  if (cm < range.min || cm > range.max) throw new BadRequestException(`Please enter a ${label} between ${range.min} and ${range.max} cm`);
  return cm;
}

@Injectable()
export class BodyMeasurementsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private journey: WeightJourneyService,
  ) {}

  /** The patient's own measurements, newest first. Voided ones are left out. */
  async list(patientId: string): Promise<BodyMeasurementModel[]> {
    await this.journey.requireGlp1(patientId);
    return this.rows(patientId);
  }

  private async rows(patientId: string): Promise<BodyMeasurementModel[]> {
    const rows = await this.prisma.bodyMeasurement.findMany({
      where: { patientId, voidedAt: null },
      orderBy: [{ measuredAt: 'desc' }, { recordedAt: 'desc' }],
      take: LIST_LIMIT,
    });
    return rows.map((r) => ({ id: r.id, measuredAt: r.measuredAt, waistCm: num(r.waistCm), hipsCm: num(r.hipsCm), armCm: num(r.armCm) }));
  }

  async add(patientId: string, input: AddBodyMeasurementInput): Promise<BodyMeasurementModel[]> {
    await this.journey.requireGlp1(patientId);

    const waistCm = checked(input.waistCm, 'waist measurement', WAIST_CM);
    const hipsCm = checked(input.hipsCm, 'hip measurement', HIPS_CM);
    const armCm = checked(input.armCm, 'arm measurement', ARM_CM);
    if (waistCm === null && hipsCm === null && armCm === null) throw new BadRequestException('Please enter at least one measurement');

    const now = Date.now();
    const measuredAt = input.measuredAt ? new Date(input.measuredAt) : new Date(now);
    if (Number.isNaN(measuredAt.getTime())) throw new BadRequestException('Please enter a valid date and time');
    if (measuredAt.getTime() > now + FUTURE_SLACK_MS) throw new BadRequestException('The date and time can’t be in the future');
    if (measuredAt.getTime() < now - MAX_BACKDATE_YEARS * 365 * 86_400_000) {
      throw new BadRequestException(`The date can’t be more than ${MAX_BACKDATE_YEARS} years ago`);
    }

    const clientRequestId = input.clientRequestId?.trim() || null;
    if (clientRequestId && clientRequestId.length > 100) throw new BadRequestException('Invalid request id');
    if (clientRequestId && (await this.prisma.bodyMeasurement.findFirst({ where: { patientId, clientRequestId }, select: { id: true } }))) {
      return this.rows(patientId); // this submission is already saved
    }

    const recent = await this.prisma.bodyMeasurement.count({ where: { patientId, recordedAt: { gte: new Date(now - 86_400_000) } } });
    if (recent >= MAX_ENTRIES_PER_DAY) throw new BadRequestException('You’ve recorded a lot of measurements today — please try again tomorrow');

    try {
      await this.prisma.bodyMeasurement.create({ data: { patientId, measuredAt, waistCm, hipsCm, armCm, clientRequestId } });
    } catch (e: any) {
      // The same submission arriving twice (double tap, retry): it's already saved, so succeed quietly.
      if (!(e?.code === 'P2002' && clientRequestId)) throw e;
    }
    return this.rows(patientId);
  }

  /** A patient hides one of their own mistaken entries. It is kept on record as voided, and the change is audited. */
  async voidOwn(patientId: string, id: string): Promise<BodyMeasurementModel[]> {
    await this.journey.requireGlp1(patientId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bodyMeasurement.updateMany({ where: { id, patientId, voidedAt: null }, data: { voidedAt: new Date() } });
      if (count === 0) throw new NotFoundException('That measurement wasn’t found');
      await this.audit.log(
        { actorId: patientId, actorRole: UserRole.PATIENT, action: 'BODY_MEASUREMENT_VOIDED', resourceType: 'BodyMeasurement', resourceId: id, patientId },
        tx,
      );
    });
    return this.rows(patientId);
  }
}
