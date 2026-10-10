import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { NOTIFICATION_TEXT, NotificationKind, notificationCategory, notificationText, type NotificationParams } from '@telehealth/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { EmailService } from '../email/email.service';
import { ClinicianRole } from '../common/enums';

/** Who a notification is for: a patient, or one staff member. */
export type Recipient = { patientId: string } | { clinicianId: string };

export type NotificationInput = {
  kind: NotificationKind;
  params?: NotificationParams;
  /** A path inside the reader's app. */
  href?: string;
  /**
   * Rows about the same thing (one patient's messages, one appointment request). A new event joins the reader's unread
   * row with this key instead of adding another, and `resolve(groupKey)` marks them all read once it is handled.
   */
  groupKey?: string;
  /** Only ever once per groupKey for this reader, even if the caller runs again (a job that retries). */
  once?: boolean;
};

// Read notifications are kept this long, unread ones a little longer; after that the thing they were about is either
// done or visible on its own page.
const KEEP_READ_DAYS = 90;
const KEEP_UNREAD_DAYS = 180;

// A message nobody has opened after this long gets one email nudge; older than the max is stale and left alone.
const UNREAD_EMAIL_AFTER_MS = 4 * 3_600_000;
const UNREAD_EMAIL_MAX_AGE_MS = 48 * 3_600_000;

export type NotificationPreferences = { pushMessages: boolean; pushOrders: boolean; pushReminders: boolean; pushRewards: boolean; emailUnreadMessages: boolean };
const PREFERENCE_FIELDS = { pushMessages: true, pushOrders: true, pushReminders: true, pushRewards: true, emailUnreadMessages: true } as const;
const PUSH_FIELD = { messages: 'pushMessages', orders: 'pushOrders', reminders: 'pushReminders', rewards: 'pushRewards' } as const;

/** What an old app version knows how to open from a push (see mobile/src/lib/push.ts). */
const LEGACY_PUSH_TYPE: Partial<Record<NotificationKind, string>> = {
  [NotificationKind.ORDER_SHIPPED]: 'order',
  [NotificationKind.ORDER_OUT_FOR_DELIVERY]: 'order',
  [NotificationKind.ORDER_DELIVERED]: 'order',
  [NotificationKind.ORDER_DELIVERY_FAILED]: 'order',
  [NotificationKind.REFUND_APPROVED]: 'refund',
  [NotificationKind.REFUND_DECLINED]: 'refund',
};

/**
 * The one way the platform tells a person something happened. Writes the notification into their inbox (the bell in
 * every app), then reaches them outside the app: a push to a patient's phone, an email to staff for urgent things.
 * Never throws: whatever caused the notification is already saved, and the page it links to shows the same news.
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private push?: PushService,
    @Optional() private email?: EmailService,
    @Optional() private config?: ConfigService,
  ) {}

  async toPatient(patientId: string, input: NotificationInput): Promise<void> {
    try {
      if (input.once && input.groupKey && (await this.prisma.notification.count({ where: { patientId, groupKey: input.groupKey } }))) return;
      const { row } = await this.record({ patientId }, input);
      const text = notificationText(row.kind, row.params as NotificationParams, row.count);
      // The app shows it either way; the phone only if the patient has not switched that kind off.
      if (!(await this.mayPush(patientId, input.kind))) return;
      await this.push?.sendToPatient(patientId, {
        title: text.title,
        body: text.body,
        data: { type: LEGACY_PUSH_TYPE[input.kind] ?? input.kind, kind: input.kind, notificationId: row.id, ...(input.href ? { href: input.href } : {}) },
      });
    } catch (err: any) {
      this.logger.warn(`Notification ${input.kind} to patient ${patientId} failed: ${err?.message}`);
    }
  }

  /**
   * To the staff members named, or else to every active member with one of `roles`. `email` sends urgent ones by email
   * too: for a new row, or when an unread row becomes a different kind (mild side effects, then severe ones), but not
   * for every further event joining an unread row.
   */
  async toStaff(to: { clinicianIds?: string[]; roles?: ClinicianRole[] }, input: NotificationInput & { email?: boolean }): Promise<void> {
    try {
      const staff = await this.prisma.clinician.findMany({
        where: {
          deactivatedAt: null,
          passwordSetAt: { not: null },
          ...(to.clinicianIds?.length ? { id: { in: to.clinicianIds } } : { role: { in: to.roles ?? [] } }),
        },
        select: { id: true, email: true, firstName: true },
      });
      for (const member of staff) {
        const { changed } = await this.record({ clinicianId: member.id }, input);
        if (input.email && changed) await this.emailStaff(member, input);
      }
    } catch (err: any) {
      this.logger.warn(`Notification ${input.kind} to staff failed: ${err?.message}`);
    }
  }

  private async mayPush(patientId: string, kind: NotificationKind): Promise<boolean> {
    const category = notificationCategory(kind);
    if (category === 'essential') return true;
    const prefs = await this.prisma.patient.findUnique({ where: { id: patientId }, select: PREFERENCE_FIELDS });
    return prefs ? prefs[PUSH_FIELD[category]] : false;
  }

  preferences(patientId: string): Promise<NotificationPreferences> {
    return this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: PREFERENCE_FIELDS });
  }

  updatePreferences(patientId: string, changes: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const data = Object.fromEntries(Object.entries(changes).filter(([k, v]) => k in PREFERENCE_FIELDS && typeof v === 'boolean'));
    return this.prisma.patient.update({ where: { id: patientId }, data, select: PREFERENCE_FIELDS });
  }

  /**
   * A message from the care team still unread after a few hours gets one email nudge (a general one: the words of the
   * message stay behind the login). Once per notification; skipped when the patient switched it off or has opened the
   * message since. Each row is claimed first so two instances running this together cannot both send.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async emailUnreadMessages(now = new Date()): Promise<number> {
    if (!this.email) return 0;
    const due = await this.prisma.notification.findMany({
      where: {
        kind: NotificationKind.CARE_TEAM_MESSAGE,
        readAt: null,
        emailedAt: null,
        updatedAt: { lt: new Date(now.getTime() - UNREAD_EMAIL_AFTER_MS), gt: new Date(now.getTime() - UNREAD_EMAIL_MAX_AGE_MS) },
        patient: { emailUnreadMessages: true, activatedAt: { not: null } },
      },
      select: { id: true, patient: { select: { email: true, firstName: true } } },
      take: 200,
    });
    const portal = (this.config?.get<string>('PATIENT_APP_URL')?.trim() || 'http://localhost:3000').replace(/\/$/, '');
    let sent = 0;
    for (const n of due) {
      if (!n.patient) continue;
      const claim = await this.prisma.notification.updateMany({ where: { id: n.id, emailedAt: null, readAt: null }, data: { emailedAt: new Date() } });
      if (claim.count === 0) continue;
      try {
        await this.email.sendConsultationUpdateEmail(n.patient.email, n.patient.firstName, 'You have an unread message from your care team', `${portal}/messages`);
        sent++;
      } catch (err: any) {
        await this.prisma.notification.updateMany({ where: { id: n.id }, data: { emailedAt: null } });
        this.logger.warn(`Unread-message email failed: ${err?.message}`);
      }
    }
    return sent;
  }

  /** The thing behind `groupKey` has been handled (replied to, answered, decided): it no longer waits for anyone. */
  async resolve(groupKey: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({ where: { groupKey, readAt: null }, data: { readAt: new Date() } });
    } catch (err: any) {
      this.logger.warn(`Resolving notifications ${groupKey} failed: ${err?.message}`);
    }
  }

  list(recipient: Recipient, { limit = 20, before }: { limit?: number; before?: Date } = {}) {
    return this.prisma.notification.findMany({
      where: { ...recipient, ...(before ? { updatedAt: { lt: before } } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
  }

  unreadCount(recipient: Recipient) {
    return this.prisma.notification.count({ where: { ...recipient, readAt: null } });
  }

  /** Marks the reader's own notifications read: the ones given, or all of them. */
  async markRead(recipient: Recipient, ids?: string[]): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { ...recipient, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return count;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async prune(now = new Date()): Promise<number> {
    const day = 86_400_000;
    const { count } = await this.prisma.notification.deleteMany({
      where: {
        OR: [
          { readAt: { not: null }, updatedAt: { lt: new Date(now.getTime() - KEEP_READ_DAYS * day) } },
          { updatedAt: { lt: new Date(now.getTime() - KEEP_UNREAD_DAYS * day) } },
        ],
      },
    });
    return count;
  }

  /** Adds the row, or joins the reader's unread row about the same thing. `changed`: new, or now a different kind. */
  private async record(recipient: Recipient, input: NotificationInput) {
    const data = { kind: input.kind, params: (input.params ?? {}) as Prisma.InputJsonValue, href: input.href ?? null, updatedAt: new Date() };
    if (input.groupKey) {
      const open = await this.prisma.notification.findFirst({ where: { ...recipient, groupKey: input.groupKey, readAt: null }, select: { id: true, kind: true } });
      if (open) {
        const row = await this.prisma.notification.update({ where: { id: open.id }, data: { ...data, count: { increment: 1 } } });
        return { row, changed: open.kind !== input.kind };
      }
    }
    const row = await this.prisma.notification.create({ data: { ...recipient, ...data, groupKey: input.groupKey ?? null } });
    return { row, changed: true };
  }

  private async emailStaff(member: { email: string; firstName: string }, input: NotificationInput) {
    if (!this.email) return;
    // The plain English title, which for urgent kinds names no patient: email is not a secure channel.
    const title = NOTIFICATION_TEXT[input.kind].title;
    const headline = title.includes('{') ? 'Something urgent needs you' : title;
    const portal = (this.config?.get<string>('CLINICIAN_APP_URL')?.trim() || 'http://localhost:3002').replace(/\/$/, '');
    try {
      await this.email.sendStaffAlertEmail(member.email, member.firstName, headline, `${portal}${input.href ?? '/'}`);
    } catch (err: any) {
      this.logger.warn(`Staff alert email (${input.kind}) failed: ${err?.message}`);
    }
  }
}
