import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { DoseStatus, PrescriptionStatus, ProductCategory } from '../common/enums';
import { missedStreak, needsRetitrationReview } from './missed-doses';
import { MissedDoseAlertModel } from './models/missed-dose-alert.model';

type Db = PrismaService | Prisma.TransactionClient;

// How many future occurrences we keep pre-generated per item, and how long
// after a missed dose we wait before flagging it (in case the patient just
// hasn't logged it yet).
const WINDOW = 8;
const MISSED_GRACE_HOURS = 24;
// How far ahead of a dose we email the patient a reminder.
const REMINDER_WINDOW_HOURS = 24;

/**
 * Individual scheduled doses (e.g. each weekly GLP-1 injection) within a
 * prescription item — the patient's dose calendar, separate from Orders
 * (which track a pack/supply, not each administration).
 */
@Injectable()
export class DosingService {
  private readonly logger = new Logger(DosingService.name);
  private readonly appUrl: string;

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    config: ConfigService,
  ) {
    this.appUrl = config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3000';
  }

  /**
   * Generates the first batch of scheduled doses for a newly-issued
   * prescription item, anchored on when the prescription was issued. A
   * product with no fixed dosing interval (e.g. twice-weekly patches) is
   * skipped rather than shown an inaccurate schedule.
   */
  async generateForItem(
    item: { id: string; prescriptionId: string; productId: string },
    patientId: string,
    anchor: Date,
    db: Db = this.prisma,
  ) {
    const product = await db.product.findUnique({ where: { id: item.productId } });
    if (!product?.doseIntervalDays) return;
    await this.topUp(item.id, patientId, product.doseIntervalDays, anchor, db, WINDOW, true);
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
   * GLP-1 patients on a stepped-up dose who haven't taken the last few doses
   * in a row — a clinician should decide whether to restart them lower.
   * Clears itself once the patient logs a dose or a new prescription starts.
   */
  async missedDoseAlerts(): Promise<MissedDoseAlertModel[]> {
    const alerts: MissedDoseAlertModel[] = [];
    for (const { item, streak } of await this.activeGlp1Streaks({ strength: { titrationStep: { gt: 1 } } })) {
      if (!needsRetitrationReview(streak, item.strength.titrationStep)) continue;
      const patient = item.prescription.patient;
      alerts.push({
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        productName: item.product.brandName ?? item.product.name,
        strengthLabel: item.strength.label,
        titrationStep: item.strength.titrationStep!,
        missedInARow: streak.count,
        missedSince: streak.since!,
        lastTakenAt: streak.lastTakenAt ?? undefined,
      });
    }
    return alerts.sort((a, b) => b.missedInARow - a.missedInARow || a.missedSince.getTime() - b.missedSince.getTime());
  }

  /**
   * The patient's own view of the same check, on their active GLP-1
   * prescription only — so doses missed on a prescription that has since
   * been replaced or stopped no longer count.
   */
  async missedDoseStatusFor(patientId: string): Promise<{ missedInARow: number; needsClinician: boolean }> {
    const items = (await this.activeGlp1Streaks({ prescription: { patientId } })).map(({ item, streak }) => ({
      missedInARow: streak.count,
      needsClinician: needsRetitrationReview(streak, item.strength.titrationStep),
    }));
    // An item that needs the clinician wins; otherwise the longest run.
    items.sort((a, b) => Number(b.needsClinician) - Number(a.needsClinician) || b.missedInARow - a.missedInARow);
    return items[0] ?? { missedInARow: 0, needsClinician: false };
  }

  /**
   * Each active GLP-1 prescription item with its current run of doses not
   * taken. Reads the whole logged history up to now (a weekly dose is ~52
   * rows a year), so a long run is counted in full.
   */
  private async activeGlp1Streaks(where: Prisma.PrescriptionItemWhereInput) {
    const now = new Date();
    const items = await this.prisma.prescriptionItem.findMany({
      where: {
        ...where,
        prescription: { ...(where.prescription as object), status: PrescriptionStatus.ACTIVE },
        product: { category: ProductCategory.GLP1 },
      },
      include: {
        product: true,
        strength: true,
        prescription: { select: { patient: { select: { id: true, firstName: true, lastName: true } } } },
        doseEvents: { where: { status: { not: DoseStatus.SCHEDULED }, scheduledFor: { lte: now } }, orderBy: { scheduledFor: 'desc' } },
      },
    });
    return items.map((item) => ({ item, streak: missedStreak(item.doseEvents, now) }));
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
      where: { prescription: { status: PrescriptionStatus.ACTIVE }, product: { doseIntervalDays: { not: null } } },
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
      // Anchor the next batch off the last generated date, so the interval never drifts,
      // and only generate as many as are missing — not another full window each time.
      const anchor = latest ? latest.scheduledFor : new Date();
      await this.topUp(item.id, item.prescription.patientId, item.product.doseIntervalDays!, anchor, this.prisma, WINDOW - remaining, !latest);
    }
  }

  /**
   * Emails a reminder for any scheduled dose coming up within the reminder
   * window, once each. Also callable from the Vercel Cron-triggered endpoint
   * (DosingCronController) alongside this in-process timer — each dose is
   * claimed atomically first, so the two triggers (or two overlapping runs
   * of this timer) can never double-send, and a dose cancelled between the
   * initial fetch and the claim just yields a no-op claim instead of a
   * stale email.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendReminders(): Promise<number> {
    const upcoming = await this.prisma.doseEvent.findMany({
      where: {
        status: DoseStatus.SCHEDULED,
        reminderSentAt: null,
        scheduledFor: { gte: new Date(), lte: new Date(Date.now() + REMINDER_WINDOW_HOURS * 3_600_000) },
      },
      include: { patient: true, prescriptionItem: { include: { product: true } } },
    });

    let sent = 0;
    for (const event of upcoming) {
      const claim = await this.prisma.doseEvent.updateMany({
        where: { id: event.id, reminderSentAt: null },
        data: { reminderSentAt: new Date() },
      });
      if (claim.count === 0) continue; // already claimed/sent, or cancelled since the fetch above

      try {
        const delivered = await this.email.sendDoseReminderEmail(
          event.patient.email,
          event.patient.firstName,
          event.prescriptionItem.product.name,
          event.scheduledFor,
          `${this.appUrl}/doses`,
        );
        if (!delivered) throw new Error('Email provider did not confirm delivery');
        sent++;
      } catch (err) {
        // Release the claim so it's retried next run, and keep processing
        // the rest of the batch — one failed send shouldn't block the others.
        await this.prisma.doseEvent.updateMany({ where: { id: event.id }, data: { reminderSentAt: null } });
        this.logger.error(`Dose reminder failed for dose ${event.id}: ${(err as Error).message}`);
      }
    }
    if (sent) this.logger.log(`Sent ${sent} dose reminder(s)`);
    return sent;
  }

  private async topUp(
    prescriptionItemId: string,
    patientId: string,
    intervalDays: number,
    anchor: Date,
    db: Db,
    count: number,
    includeAnchor: boolean,
  ) {
    const dates: Date[] = [];
    for (let i = includeAnchor ? 0 : 1; dates.length < count; i++) {
      dates.push(new Date(anchor.getTime() + i * intervalDays * 86_400_000));
    }
    for (const scheduledFor of dates) {
      await db.doseEvent.upsert({
        where: { prescriptionItemId_scheduledFor: { prescriptionItemId, scheduledFor } },
        update: {},
        create: { prescriptionItemId, patientId, scheduledFor },
      });
    }
  }
}
