import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectionSite, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CheckInFeeling, DoseStatus, PrescriptionStatus, ProductCategory, ProductForm } from '../common/enums';
import { DosePattern, dosePattern, nextDoseDates } from './dose-pattern';
import { missedStreak, needsRetitrationReview } from './missed-doses';
import { MissedDoseAlertModel } from './models/missed-dose-alert.model';
import { DoseSummaryModel } from './models/dose-summary.model';

type Db = PrismaService | Prisma.TransactionClient;

// How many future occurrences we keep pre-generated per item, and how long
// after a missed dose we wait before flagging it (in case the patient just
// hasn't logged it yet).
const WINDOW = 8;
/** A prescription this new gets its first dose on the day it was issued. */
const FRESH_PRESCRIPTION_MS = 7 * 86_400_000;
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
    const rx = await db.prescription.findUnique({ where: { id: item.prescriptionId }, select: { validUntil: true } });
    await this.topUp(item.id, patientId, withinValidity(nextDoseDates(pattern, anchor, null, WINDOW), rx?.validUntil), db);
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

  /** `site` is where it was injected; it only makes sense for an injectable medicine. */
  async markTaken(patientId: string, id: string, site?: InjectionSite) {
    const event = await this.findOwned(patientId, id);
    if (event.status === DoseStatus.SKIPPED) {
      throw new BadRequestException('This dose was already marked as skipped');
    }
    if (site) await this.assertInjectable(event.prescriptionItemId);
    if (event.status === DoseStatus.TAKEN) {
      // Logged without a site earlier: let it be added now, but never overwrite one that was chosen.
      if (site && !event.injectionSite) return this.prisma.doseEvent.update({ where: { id }, data: { injectionSite: site } });
      return event;
    }
    return this.prisma.doseEvent.update({
      where: { id },
      data: { status: DoseStatus.TAKEN, takenAt: new Date(), ...(site ? { injectionSite: site } : {}) },
    });
  }

  /** How the patient felt after a dose they took — the doctor's cue for whether to step the dose up. */
  async logFeeling(patientId: string, id: string, feeling: CheckInFeeling) {
    const event = await this.findOwned(patientId, id);
    if (event.status !== DoseStatus.TAKEN) throw new BadRequestException('Mark the dose as taken first');
    return this.prisma.doseEvent.update({ where: { id }, data: { feelingAfter: feeling, feelingAfterAt: new Date() } });
  }

  private async assertInjectable(prescriptionItemId: string) {
    const item = await this.prisma.prescriptionItem.findUnique({ where: { id: prescriptionItemId }, select: { product: { select: { form: true } } } });
    const form = item?.product.form;
    if (form !== ProductForm.INJECTION_PEN && form !== ProductForm.INJECTION_VIAL) throw new BadRequestException('An injection site only applies to an injection');
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
      data: { status: overdue ? DoseStatus.MISSED : DoseStatus.SCHEDULED, takenAt: null, note: null, injectionSite: null, feelingAfter: null, feelingAfterAt: null },
    });
  }

  private async findOwned(patientId: string, id: string) {
    const event = await this.prisma.doseEvent.findUnique({ where: { id } });
    if (!event || event.patientId !== patientId) throw new NotFoundException('Dose not found');
    return event;
  }

  /**
   * Makes sure a patient on a medicine with fixed dose days actually has a schedule. Doses are written when
   * a prescription is issued and topped up hourly, but a prescription can end up with none (its product only
   * later got a dose frequency, or the hourly run hasn't happened yet) — and then the patient's calendar, next
   * dose and supply count are all silently empty. Reading the schedule repairs it. Cheap when nothing is missing.
   */
  async ensureSchedule(patientId: string): Promise<void> {
    const now = new Date();
    const items = await this.prisma.prescriptionItem.findMany({
      where: {
        prescription: { patientId, status: PrescriptionStatus.ACTIVE, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        product: { OR: [{ doseIntervalDays: { not: null } }, { dosesPerWeek: { not: null } }] },
        doseEvents: { none: {} },
      },
      include: { product: true, prescription: { select: { issuedAt: true, validUntil: true } } },
    });
    for (const item of items) {
      const pattern = dosePattern(item.product);
      if (!pattern) continue;
      // A fresh prescription starts on the day it was issued; an old one picks up from today rather than
      // inventing a history of missed doses nobody was ever asked to take.
      const fresh = now.getTime() - item.prescription.issuedAt.getTime() < FRESH_PRESCRIPTION_MS;
      const dates = nextDoseDates(pattern, item.prescription.issuedAt, fresh ? null : now, WINDOW);
      await this.topUp(item.id, patientId, withinValidity(dates, item.prescription.validUntil), this.prisma);
    }
  }

  /** The patient's own calendar: recent history plus what's still ahead. */
  async calendarFor(patientId: string, { fromDays = 30, toDays = 60 } = {}) {
    await this.ensureSchedule(patientId);
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
   * The dose the patient is on and the date of the next one — for the dashboard. Null when they have
   * no active prescription. A dose still within a day of its scheduled time counts as "next".
   */
  async summaryFor(patientId: string): Promise<DoseSummaryModel | null> {
    await this.ensureSchedule(patientId);
    const rx = await this.prisma.prescription.findFirst({
      where: { patientId, status: PrescriptionStatus.ACTIVE },
      orderBy: { issuedAt: 'desc' },
      select: { medication: true, dosage: true, items: { select: { id: true, product: { select: { name: true, brandName: true } }, strength: { select: { label: true } } } } },
    });
    if (!rx) return null;

    const next = await this.prisma.doseEvent.findFirst({
      where: { patientId, prescriptionItemId: { in: rx.items.map((i) => i.id) }, status: DoseStatus.SCHEDULED, scheduledFor: { gte: new Date(Date.now() - 24 * 3_600_000) } },
      orderBy: { scheduledFor: 'asc' },
      include: { prescriptionItem: { include: { product: true, strength: true } } },
    });
    const item = next?.prescriptionItem ?? rx.items[0];
    const current = item ? `${item.product.brandName ?? item.product.name} ${item.strength.label}` : `${rx.medication} ${rx.dosage}`.trim();
    return { current, nextDoseId: next?.id, nextDoseAt: next?.scheduledFor };
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

    const now = new Date();
    const items = await this.prisma.prescriptionItem.findMany({
      where: {
        // Nothing to schedule on a prescription that has run out.
        prescription: { status: PrescriptionStatus.ACTIVE, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        product: { OR: [{ doseIntervalDays: { not: null } }, { dosesPerWeek: { not: null } }] },
      },
      include: {
        product: true,
        prescription: { select: { patientId: true, issuedAt: true, validUntil: true } },
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
      // An item with no doses yet (e.g. a patch prescribed before patches had a
      // calendar) follows its prescription's own schedule, from now on.
      const dates = latest
        ? nextDoseDates(pattern, await this.seriesStart(item.id, pattern, latest.scheduledFor), latest.scheduledFor, WINDOW - remaining)
        : nextDoseDates(pattern, item.prescription.issuedAt, now, WINDOW - remaining);
      await this.topUp(item.id, item.prescription.patientId, withinValidity(dates, item.prescription.validUntil), this.prisma);
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

/** Drops dates after the prescription stops being valid. */
function withinValidity(dates: Date[], validUntil: Date | null | undefined): Date[] {
  return validUntil ? dates.filter((d) => d.getTime() <= validUntil.getTime()) : dates;
}
