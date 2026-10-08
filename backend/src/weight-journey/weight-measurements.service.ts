import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CheckInStatus, UserRole } from '../common/enums';
import { UploadKind } from '@prisma/client';
import { CheckInFeeling } from '../common/enums';
import { AddWeightInput, CorrectWeightEntryInput, EditMyWeightInput } from './dto/weight-journey.input';
import {
  ForecastConfidence, ForecastUnavailableReason, ProgressPhotoModel, WeightForecastModel, WeightJourneyModel, WeightMeasurementKind, WeightTimelineModel, WeightTrendModel,
} from './models/weight-journey.model';
import { forecastWeight } from './weight-forecast';
import { assessWeightTrend } from './weight-trend';
import { assertValidWeight, WeightJourneyService } from './weight-journey.service';
import { latestOf, RawMeasurement, sortMeasurements, withChanges } from './weight-timeline';
import { round1 } from './weight-math';

// A weighing can be back-dated (forgot to log it) but not made up in advance; a little
// slack covers a phone clock running slightly ahead of the server's.
const FUTURE_SLACK_MS = 5 * 60_000;
const MAX_BACKDATE_YEARS = 5;
const MAX_NOTE_LENGTH = 500;
// Per patient per rolling 24h — far above real use, a guard against a runaway client.
const MAX_ENTRIES_PER_DAY = 200;

export const TIMELINE_MAX_LIMIT = 5000;
const TIMELINE_MAX_SPAN_YEARS = 20;

const num = (v: unknown): number => Number(v);

@Injectable()
export class WeightMeasurementsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private journey: WeightJourneyService,
  ) {}

  // ── patient ───────────────────────────────────────────────────────────────

  async add(patientId: string, input: AddWeightInput): Promise<WeightJourneyModel> {
    await this.journey.requireGlp1(patientId);

    const weightKg = round1(input.weightKg);
    assertValidWeight(weightKg, 'Weight');

    const now = Date.now();
    const measuredAt = this.validMeasuredAt(input.measuredAt, now);
    const note = this.cleanNote(input.note);
    const clientRequestId = input.clientRequestId?.trim() || null;
    if (clientRequestId && clientRequestId.length > 100) throw new BadRequestException('Invalid request id');

    // The same submission arriving again (double tap, or a retry after a lost response): it is already
    // saved — with its photo, which would otherwise look "already attached" — so succeed quietly.
    if (clientRequestId) {
      const saved = await this.prisma.weightEntry.findFirst({ where: { patientId, clientRequestId }, select: { id: true } });
      if (saved) return this.journey.forPatient(patientId) as Promise<WeightJourneyModel>;
    }

    const photoFileId = input.photoFileId?.trim() || null;
    if (photoFileId) await this.assertPhotoIsTheirs(patientId, photoFileId);

    const recent = await this.prisma.weightEntry.count({ where: { patientId, recordedAt: { gte: new Date(now - 86_400_000) } } });
    if (recent >= MAX_ENTRIES_PER_DAY) throw new BadRequestException('You’ve recorded a lot of weights today — please try again tomorrow');

    try {
      await this.prisma.weightEntry.create({ data: { patientId, weightKg, measuredAt, note, clientRequestId, photoFileId } });
    } catch (e: any) {
      if (e?.code === 'P2002' && String(e.meta?.target).includes('photo_file_id')) {
        throw new BadRequestException('That photo is already attached to another weighing');
      }
      // The same submission arriving twice (double tap, retry): it's already saved, so succeed quietly.
      if (!(e?.code === 'P2002' && clientRequestId)) throw e;
    }
    return this.journey.forPatient(patientId) as Promise<WeightJourneyModel>;
  }

  private validMeasuredAt(value: Date | undefined | null, now: number): Date {
    const measuredAt = value ? new Date(value) : new Date(now);
    if (Number.isNaN(measuredAt.getTime())) throw new BadRequestException('Please enter a valid date and time');
    if (measuredAt.getTime() > now + FUTURE_SLACK_MS) throw new BadRequestException('The date and time can’t be in the future');
    if (measuredAt.getTime() < now - MAX_BACKDATE_YEARS * 365 * 86_400_000) {
      throw new BadRequestException(`The date can’t be more than ${MAX_BACKDATE_YEARS} years ago`);
    }
    return measuredAt;
  }

  private cleanNote(value: string | undefined | null): string | null {
    const note = value?.trim() || null;
    if (note && note.length > MAX_NOTE_LENGTH) throw new BadRequestException(`Notes can be up to ${MAX_NOTE_LENGTH} characters`);
    return note;
  }

  /** The photo must be the patient's own progress photo, not yet attached to anything. */
  private async assertPhotoIsTheirs(patientId: string, fileId: string) {
    const file = await this.prisma.uploadedFile.findFirst({
      where: { id: fileId, patientId, kind: UploadKind.PROGRESS_PHOTO },
      select: { weightEntry: { select: { id: true } } },
    });
    if (!file) throw new BadRequestException('We couldn’t find that photo — please upload it again');
    if (file.weightEntry) throw new BadRequestException('That photo is already attached to another weighing');
  }

  /**
   * A patient removes their own mistaken entry. It's voided, not deleted, and the change is audited.
   * Its photo is let go of, so the clean-up of unattached photos erases the picture itself: a body
   * photo the patient removed is not kept.
   */
  async voidOwn(patientId: string, entryId: string, reason?: string): Promise<WeightJourneyModel> {
    const entry = await this.prisma.weightEntry.findFirst({ where: { id: entryId, patientId } });
    if (!entry || entry.voidedAt) throw new NotFoundException('That weight entry wasn’t found');
    if (entry.source === 'STAFF') throw new BadRequestException('This entry was corrected by your care team and can’t be removed here');

    // The void and its audit row commit together, or not at all.
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.weightEntry.updateMany({
        where: { id: entryId, patientId, voidedAt: null },
        data: { voidedAt: new Date(), voidedById: patientId, voidReason: reason?.trim() || null, photoFileId: null },
      });
      if (count === 0) throw new NotFoundException('That weight entry wasn’t found');
      await this.audit.log(
        {
          actorId: patientId,
          actorRole: UserRole.PATIENT,
          action: 'WEIGHT_ENTRY_VOIDED',
          resourceType: 'WeightEntry',
          resourceId: entryId,
          patientId: patientId,
          metadata: { weightKg: num(entry.weightKg), measuredAt: entry.measuredAt, reason: reason?.trim() || null, photoFileId: entry.photoFileId ?? null },
        },
        tx,
      );
    });
    return this.journey.forPatient(patientId) as Promise<WeightJourneyModel>;
  }

  /**
   * A patient changes one of their own entries: its weight, date, note or photo. The table is
   * append-only (the database refuses any update but a void), so nothing is ever overwritten: the
   * entry is voided and kept, and a replacement pointing back at it is added, as a staff correction
   * does. The before and after go in the audit log, which also says whether the measurement itself
   * changed or only what goes with it.
   */
  async editOwn(patientId: string, input: EditMyWeightInput): Promise<WeightJourneyModel> {
    await this.journey.requireGlp1(patientId);
    const entry = await this.prisma.weightEntry.findFirst({ where: { id: input.entryId, patientId } });
    if (!entry || entry.voidedAt) throw new NotFoundException('That weight entry wasn’t found');
    if (entry.source === 'STAFF') throw new BadRequestException('This entry was corrected by your care team and can’t be changed here');

    const before = { weightKg: num(entry.weightKg), measuredAt: entry.measuredAt, note: entry.note ?? null, photoFileId: entry.photoFileId ?? null };
    const after = { ...before };
    if (input.weightKg !== undefined && input.weightKg !== null) {
      after.weightKg = round1(input.weightKg);
      assertValidWeight(after.weightKg, 'Weight');
    }
    if (input.measuredAt) after.measuredAt = this.validMeasuredAt(input.measuredAt, Date.now());
    if (input.note !== undefined && input.note !== null) after.note = this.cleanNote(input.note);

    const newPhoto = input.photoFileId?.trim() || null;
    if (newPhoto && newPhoto !== before.photoFileId) {
      await this.assertPhotoIsTheirs(patientId, newPhoto);
      after.photoFileId = newPhoto;
    } else if (input.removePhoto && !newPhoto) {
      after.photoFileId = null;
    }

    const measurementChanged = after.weightKg !== before.weightKg || after.measuredAt.getTime() !== before.measuredAt.getTime();
    if (!measurementChanged && after.note === before.note && after.photoFileId === before.photoFileId) {
      return this.journey.forPatient(patientId) as Promise<WeightJourneyModel>;
    }
    // Every change adds a row, so the same guard as for new entries applies.
    const recent = await this.prisma.weightEntry.count({ where: { patientId, recordedAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (recent >= MAX_ENTRIES_PER_DAY) throw new BadRequestException('You’ve changed a lot of weights today — please try again tomorrow');

    try {
      // Void, replacement and audit row commit together, or not at all.
      await this.prisma.$transaction(async (tx) => {
        // The original lets go of its photo as it is voided: a photo belongs to one entry at a time.
        const { count } = await tx.weightEntry.updateMany({
          where: { id: entry.id, patientId, voidedAt: null },
          data: { voidedAt: new Date(), voidedById: patientId, voidReason: 'Changed by the patient', photoFileId: null },
        });
        if (count === 0) throw new NotFoundException('That weight entry wasn’t found');
        const replacement = await tx.weightEntry.create({
          data: {
            patientId, weightKg: after.weightKg, measuredAt: after.measuredAt, note: after.note, photoFileId: after.photoFileId, correctsId: entry.id,
            // A reading from a scale or health app stays one when only its note or photo changed. A weight or date the
            // patient typed over it is theirs. The device's own id for the reading stays on the original, which is unique per device.
            ...(measurementChanged ? {} : { source: entry.source, deviceConnectionId: entry.deviceConnectionId }),
          },
        });
        await this.audit.log(
          {
            actorId: patientId,
            actorRole: UserRole.PATIENT,
            action: measurementChanged ? 'WEIGHT_ENTRY_CORRECTED' : 'WEIGHT_ENTRY_EDITED',
            resourceType: 'WeightEntry',
            resourceId: entry.id,
            patientId,
            metadata: { before, after, replacementId: replacement.id, source: entry.source },
          },
          tx,
        );
      });
    } catch (e: any) {
      if (e?.code === 'P2002' && String(e.meta?.target).includes('photo_file_id')) {
        throw new BadRequestException('That photo is already attached to another weighing');
      }
      throw e;
    }
    return this.journey.forPatient(patientId) as Promise<WeightJourneyModel>;
  }

  // ── staff ─────────────────────────────────────────────────────────────────

  /** Void the wrong entry and add a replacement at the same moment that points back at it. */
  async correct(staffId: string, input: CorrectWeightEntryInput): Promise<WeightJourneyModel> {
    const reason = input.reason?.trim();
    if (!reason) throw new BadRequestException('Please give a reason for the correction');
    const weightKg = round1(input.weightKg);
    assertValidWeight(weightKg, 'Weight');

    const entry = await this.prisma.weightEntry.findUnique({ where: { id: input.entryId } });
    if (!entry) throw new NotFoundException('Weight entry not found');
    if (entry.voidedAt) throw new BadRequestException('That entry has already been voided or corrected');
    await this.journey.requireGlp1(entry.patientId); // weight-management patients only

    // Void, replacement and audit row commit together, or not at all.
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.weightEntry.updateMany({
        where: { id: entry.id, voidedAt: null },
        // The photo moves to the replacement, so the patient's picture doesn't vanish with the wrong number.
        data: { voidedAt: new Date(), voidedById: staffId, voidReason: reason, photoFileId: null },
      });
      if (count === 0) throw new BadRequestException('That entry has already been voided or corrected');
      const replacement = await tx.weightEntry.create({
        data: { patientId: entry.patientId, weightKg, measuredAt: entry.measuredAt, note: entry.note, source: 'STAFF', correctsId: entry.id, photoFileId: entry.photoFileId ?? null },
      });
      await this.audit.log(
        {
          actorId: staffId,
          actorRole: UserRole.CLINICIAN,
          action: 'WEIGHT_ENTRY_CORRECTED',
          resourceType: 'WeightEntry',
          resourceId: entry.id,
          patientId: entry.patientId,
          metadata: { before: num(entry.weightKg), after: weightKg, reason, replacementId: replacement.id, patientId: entry.patientId },
        },
        tx,
      );
    });
    return this.journey.forPatient(entry.patientId) as Promise<WeightJourneyModel>;
  }

  async voidByStaff(staffId: string, entryId: string, reason: string): Promise<WeightJourneyModel> {
    const why = reason?.trim();
    if (!why) throw new BadRequestException('Please give a reason');
    const entry = await this.prisma.weightEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Weight entry not found');
    await this.journey.requireGlp1(entry.patientId); // weight-management patients only

    // The void and its audit row commit together, or not at all.
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.weightEntry.updateMany({
        where: { id: entryId, voidedAt: null },
        data: { voidedAt: new Date(), voidedById: staffId, voidReason: why },
      });
      if (count === 0) throw new BadRequestException('That entry has already been voided or corrected');
      await this.audit.log(
        {
          actorId: staffId,
          actorRole: UserRole.CLINICIAN,
          action: 'WEIGHT_ENTRY_VOIDED',
          resourceType: 'WeightEntry',
          resourceId: entryId,
          patientId: entry.patientId,
          metadata: { weightKg: num(entry.weightKg), measuredAt: entry.measuredAt, reason: why, patientId: entry.patientId },
        },
        tx,
      );
    });
    return this.journey.forPatient(entry.patientId) as Promise<WeightJourneyModel>;
  }

  // ── reading ───────────────────────────────────────────────────────────────

  /**
   * Every weighing — daily entries and monthly check-ins — in [from, to], oldest first, each
   * with its change from the one before (even when that one lies outside the window). Bounded:
   * at most `limit` rows, keeping the newest, with `truncated` set if there were more.
   */
  async timeline(patientId: string, from: Date, to: Date, limit?: number | null): Promise<WeightTimelineModel> {
    if (!(from instanceof Date) || !(to instanceof Date) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Please give a valid date range');
    }
    if (from >= to) throw new BadRequestException('The start of the range must be before its end');
    if (to.getTime() - from.getTime() > TIMELINE_MAX_SPAN_YEARS * 365 * 86_400_000) {
      throw new BadRequestException(`Please ask for at most ${TIMELINE_MAX_SPAN_YEARS} years at a time`);
    }
    const max = Math.min(Math.max(Math.floor(limit ?? TIMELINE_MAX_LIMIT), 1), TIMELINE_MAX_LIMIT);

    const patient = await this.journey.requireGlp1(patientId);
    const start = this.journey.startingPoint(patient);

    const entryWhere = { patientId, voidedAt: null };
    const checkInWhere = { patientId, status: CheckInStatus.COMPLETED, weightKg: { not: null } };
    const [entries, checkIns, prevEntry, prevCheckIn, entryBounds, checkInBounds] = await Promise.all([
      this.prisma.weightEntry.findMany({
        where: { ...entryWhere, measuredAt: { gte: from, lte: to } },
        orderBy: { measuredAt: 'desc' },
        take: max + 1,
      }),
      this.prisma.checkIn.findMany({
        where: { ...checkInWhere, completedAt: { gte: from, lte: to } },
        orderBy: { completedAt: 'desc' },
        take: max + 1,
      }),
      this.prisma.weightEntry.findFirst({ where: { ...entryWhere, measuredAt: { lt: from } }, orderBy: { measuredAt: 'desc' } }),
      this.prisma.checkIn.findFirst({ where: { ...checkInWhere, completedAt: { lt: from } }, orderBy: { completedAt: 'desc' } }),
      this.prisma.weightEntry.aggregate({ where: entryWhere, _min: { measuredAt: true }, _max: { measuredAt: true } }),
      this.prisma.checkIn.aggregate({ where: { ...checkInWhere, completedAt: { not: null } }, _min: { completedAt: true }, _max: { completedAt: true } }),
    ]);

    const raw: RawMeasurement[] = [
      ...entries.map((e) => ({ id: e.id, measuredAt: e.measuredAt, weightKg: num(e.weightKg), kind: 'DAILY' as const, note: e.note ?? undefined, hasPhoto: e.photoFileId !== null, patientCanEdit: e.source !== 'STAFF' })),
      ...checkIns.map((c) => ({
        id: c.id,
        measuredAt: c.completedAt!,
        weightKg: num(c.weightKg),
        kind: 'CHECK_IN' as const,
        feeling: (c.feeling as CheckInFeeling | null) ?? undefined,
      })),
    ];
    const sorted = sortMeasurements(raw);
    const truncated = sorted.length > max;
    const dropped = truncated ? sorted.slice(0, sorted.length - max) : [];
    const kept = truncated ? sorted.slice(sorted.length - max) : sorted;

    // What the first returned point is compared against: the item just before it.
    const prior = latestOf(
      prevEntry ? { id: prevEntry.id, measuredAt: prevEntry.measuredAt, weightKg: num(prevEntry.weightKg), kind: 'DAILY' } : null,
      prevCheckIn ? { id: prevCheckIn.id, measuredAt: prevCheckIn.completedAt!, weightKg: num(prevCheckIn.weightKg), kind: 'CHECK_IN' } : null,
    );
    const before = dropped.length ? dropped[dropped.length - 1].weightKg : prior?.weightKg ?? start?.kg ?? null;

    const dates = [entryBounds._min.measuredAt, checkInBounds._min.completedAt].filter(Boolean) as Date[];
    const latest = [entryBounds._max.measuredAt, checkInBounds._max.completedAt].filter(Boolean) as Date[];

    return {
      measurements: withChanges(kept, before).map((m) => ({ ...m, hasPhoto: m.hasPhoto ?? false, patientCanEdit: m.patientCanEdit ?? false, kind: m.kind as WeightMeasurementKind, feeling: m.feeling as CheckInFeeling | undefined })),
      startingWeightKg: start?.kg,
      startingAt: start?.at,
      targetWeightKg: patient.weightGoal ? num(patient.weightGoal.targetWeightKg) : undefined,
      earliestAt: dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : undefined,
      latestAt: latest.length ? new Date(Math.max(...latest.map((d) => d.getTime()))) : undefined,
      truncated,
    };
  }

  // ── progress photos ───────────────────────────────────────────────────────

  /** Weighings that have a photo, oldest first. Voided entries are left out. */
  async progressPhotos(patientId: string): Promise<ProgressPhotoModel[]> {
    const rows = await this.prisma.weightEntry.findMany({
      where: { patientId, voidedAt: null, photoFileId: { not: null } },
      orderBy: { measuredAt: 'asc' },
      select: { id: true, measuredAt: true, weightKg: true, photoFileId: true, note: true, source: true },
      take: 500,
    });
    return rows.map((r) => ({ entryId: r.id, measuredAt: r.measuredAt, weightKg: num(r.weightKg), photoFileId: r.photoFileId!, note: r.note ?? undefined, patientCanEdit: r.source !== 'STAFF' }));
  }

  // ── trend ─────────────────────────────────────────────────────────────────

  /**
   * The trend for many patients at once, for the doctors' alert list: three queries however many patients there are,
   * instead of a timeline each. The same weights the single-patient trend reads (daily entries not voided, and check-ins).
   */
  async trendsFor(patientIds: string[], now = new Date()): Promise<Map<string, WeightTrendModel>> {
    const out = new Map<string, WeightTrendModel>();
    if (patientIds.length === 0) return out;
    const from = new Date(now.getTime() - 120 * 86_400_000);
    const to = new Date(now.getTime() + 60_000);
    const [entries, checkIns, goals] = await Promise.all([
      this.prisma.weightEntry.findMany({ where: { patientId: { in: patientIds }, voidedAt: null, measuredAt: { gte: from, lte: to } }, select: { patientId: true, measuredAt: true, weightKg: true } }),
      this.prisma.checkIn.findMany({ where: { patientId: { in: patientIds }, status: CheckInStatus.COMPLETED, weightKg: { not: null }, completedAt: { gte: from, lte: to } }, select: { patientId: true, completedAt: true, weightKg: true } }),
      this.prisma.weightGoal.findMany({ where: { patientId: { in: patientIds } }, select: { patientId: true, targetWeightKg: true } }),
    ]);
    const byPatient = new Map<string, { measuredAt: Date; weightKg: number }[]>();
    const add = (id: string, measuredAt: Date, weightKg: number) => byPatient.set(id, [...(byPatient.get(id) ?? []), { measuredAt, weightKg }]);
    entries.forEach((e) => add(e.patientId, e.measuredAt, num(e.weightKg)));
    checkIns.forEach((c) => add(c.patientId, c.completedAt!, num(c.weightKg)));
    const target = new Map(goals.map((g) => [g.patientId, num(g.targetWeightKg)]));
    for (const id of patientIds) out.set(id, assessWeightTrend(byPatient.get(id) ?? [], { targetKg: target.get(id) ?? null, now }) as WeightTrendModel);
    return out;
  }

  /** What the recent weights say, for the patient and for their doctor. */
  async trend(patientId: string, now = new Date()): Promise<WeightTrendModel> {
    const from = new Date(now.getTime() - 120 * 86_400_000);
    const tl = await this.timeline(patientId, from, new Date(now.getTime() + 60_000));
    return assessWeightTrend(tl.measurements.map((m) => ({ measuredAt: m.measuredAt, weightKg: m.weightKg })), { targetKg: tl.targetWeightKg, now }) as WeightTrendModel;
  }

  // ── forecast ──────────────────────────────────────────────────────────────

  async forecast(patientId: string, now = new Date()): Promise<WeightForecastModel> {
    const from = new Date(now.getTime() - 120 * 86_400_000);
    const tl = await this.timeline(patientId, from, new Date(now.getTime() + 60_000));
    const result = forecastWeight(tl.measurements.map((m) => ({ measuredAt: m.measuredAt, weightKg: m.weightKg })), { targetKg: tl.targetWeightKg, now });
    if (result.available === false) return { available: false, reason: result.reason as ForecastUnavailableReason, points: [] };
    return {
      available: true,
      basedOnPoints: result.basedOnPoints,
      basedOnDays: result.basedOnDays,
      kgPerWeek: result.kgPerWeek,
      confidence: result.confidence as ForecastConfidence,
      fromAt: result.from.at,
      fromWeightKg: result.from.weightKg,
      points: result.points,
      reachesTargetAt: result.reachesTargetAt ?? undefined,
    };
  }
}
