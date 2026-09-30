import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DoseStatus, PrescriptionStatus } from '../common/enums';
import { DosePattern, dosePattern, nextDoseDates } from './dose-pattern';

type Db = PrismaService | Prisma.TransactionClient;

// How many future occurrences we keep pre-generated per item, and how long
// after a missed dose we wait before flagging it (in case the patient just
// hasn't logged it yet).
const WINDOW = 8;
const MISSED_GRACE_HOURS = 24;

/**
 * Individual scheduled doses (e.g. each weekly GLP-1 injection) within a
 * prescription item — the patient's dose calendar, separate from Orders
 * (which track a pack/supply, not each administration).
 */
@Injectable()
export class DosingService {
  private readonly logger = new Logger(DosingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Generates the first batch of scheduled doses for a newly-issued
   * prescription item, anchored on when the prescription was issued. A
   * product with no fixed dosing schedule (neither an interval nor a set
   * number of doses a week) is skipped rather than shown an inaccurate one.
   */
  async generateForItem(
    item: { id: string; prescriptionId: string; productId: string },
    patientId: string,
    anchor: Date,
    db: Db = this.prisma,
  ) {
    const product = await db.product.findUnique({ where: { id: item.productId } });
    const pattern = product && dosePattern(product);
    if (!pattern) return;
    await this.topUp(item.id, patientId, nextDoseDates(pattern, anchor, null, WINDOW), db);
  }

  /** Deletes not-yet-due doses when a prescription is superseded or cancelled; past history is kept. */
  async cancelForPrescription(prescriptionId: string, db: Db = this.prisma) {
    await db.doseEvent.deleteMany({
      where: {
        status: DoseStatus.SCHEDULED,
        prescriptionItem: { prescriptionId },
      },
    });
  }

  async markTaken(patientId: string, id: string) {
    const event = await this.findOwned(patientId, id);
    if (event.status === DoseStatus.TAKEN) return event;
    if (event.status === DoseStatus.SKIPPED) {
      throw new BadRequestException('This dose was already marked as skipped');
    }
    return this.prisma.doseEvent.update({ where: { id }, data: { status: DoseStatus.TAKEN, takenAt: new Date() } });
  }

  async markSkipped(patientId: string, id: string, note?: string) {
    const event = await this.findOwned(patientId, id);
    if (event.status === DoseStatus.TAKEN) throw new BadRequestException('This dose was already marked as taken');
    return this.prisma.doseEvent.update({
      where: { id },
      data: { status: DoseStatus.SKIPPED, note: note?.trim() || null },
    });
  }

  /** Undoes a taken/skipped mark, back to scheduled (or missed, if it's now overdue) — lets a patient correct a mistake. */
  async unmark(patientId: string, id: string) {
    const event = await this.findOwned(patientId, id);
    const overdue = event.scheduledFor.getTime() < Date.now() - MISSED_GRACE_HOURS * 3_600_000;
    return this.prisma.doseEvent.update({
      where: { id },
      data: { status: overdue ? DoseStatus.MISSED : DoseStatus.SCHEDULED, takenAt: null, note: null },
    });
  }

  private async findOwned(patientId: string, id: string) {
    const event = await this.prisma.doseEvent.findUnique({ where: { id } });
    if (!event || event.patientId !== patientId) throw new NotFoundException('Dose not found');
    return event;
  }

  /** The patient's own calendar: recent history plus what's still ahead. */
  calendarFor(patientId: string, { fromDays = 30, toDays = 60 } = {}) {
    return this.prisma.doseEvent.findMany({
      where: {
        patientId,
        scheduledFor: { gte: new Date(Date.now() - fromDays * 86_400_000), lte: new Date(Date.now() + toDays * 86_400_000) },
      },
      include: { prescriptionItem: { include: { product: true, strength: true } } },
      orderBy: { scheduledFor: 'asc' },
    });
  }

  /**
   * Runs hourly: flips doses that were never logged into MISSED once the
   * grace period has passed, and tops up the rolling window of upcoming
   * doses for every prescription still active.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async houseKeeping() {
    const { count } = await this.prisma.doseEvent.updateMany({
      where: { status: DoseStatus.SCHEDULED, scheduledFor: { lt: new Date(Date.now() - MISSED_GRACE_HOURS * 3_600_000) } },
      data: { status: DoseStatus.MISSED },
    });
    if (count) this.logger.log(`Marked ${count} unlogged dose(s) as missed`);

    const items = await this.prisma.prescriptionItem.findMany({
      where: {
        prescription: { status: PrescriptionStatus.ACTIVE },
        product: { OR: [{ doseIntervalDays: { not: null } }, { dosesPerWeek: { not: null } }] },
      },
      include: {
        product: true,
        prescription: { select: { patientId: true } },
        doseEvents: { orderBy: { scheduledFor: 'desc' }, take: 1 },
      },
    });

    for (const item of items) {
      const latest = item.doseEvents[0];
      const remaining = await this.prisma.doseEvent.count({
        where: { prescriptionItemId: item.id, status: DoseStatus.SCHEDULED },
      });
      if (remaining >= WINDOW) continue;
      const pattern = dosePattern(item.product);
      if (!pattern) continue;
      // Continue after the last generated date, so the schedule never drifts, and
      // only generate as many as are missing — not another full window each time.
      const dates = latest
        ? nextDoseDates(pattern, await this.seriesStart(item.id, pattern, latest.scheduledFor), latest.scheduledFor, WINDOW - remaining)
        : nextDoseDates(pattern, new Date(), null, WINDOW - remaining);
      await this.topUp(item.id, item.prescription.patientId, dates, this.prisma);
    }
  }

  /**
   * Where the item's repeating cycle starts. With one dose per cycle any
   * dose is on it, so the latest will do; with several (e.g. Mon/Thu
   * patches) the weekdays are fixed by the very first dose.
   */
  private async seriesStart(prescriptionItemId: string, pattern: DosePattern, latest: Date) {
    if (pattern.offsets.length === 1) return latest;
    const first = await this.prisma.doseEvent.findFirst({ where: { prescriptionItemId }, orderBy: { scheduledFor: 'asc' } });
    return first?.scheduledFor ?? latest;
  }

  private async topUp(prescriptionItemId: string, patientId: string, dates: Date[], db: Db) {
    for (const scheduledFor of dates) {
      await db.doseEvent.upsert({
        where: { prescriptionItemId_scheduledFor: { prescriptionItemId, scheduledFor } },
        update: {},
        create: { prescriptionItemId, patientId, scheduledFor },
      });
    }
  }
}
