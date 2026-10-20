import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { UserRole } from '../common/enums';

const DAY = 86_400_000;
/** A monthly email for six months after the subscription ended, then the account closes a month after the last one. */
export const LAPSED_EMAILS = 6;
const MONTH_DAYS = 30;
export const CLOSE_AFTER_DAYS = MONTH_DAYS * (LAPSED_EMAILS + 1);
const BATCH = 100;

/**
 * Patients whose subscription ended but who paid for at least a month keep their account. They are emailed once a month for
 * six months, and then their sign-in is closed (their records are kept). A patient who starts again drops out, because
 * their subscription is no longer ended.
 */
@Injectable()
export class LapsedPatientsService {
  private readonly logger = new Logger(LapsedPatientsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDaily() {
    await this.sweep();
  }

  async sweep(now = new Date()): Promise<{ emailed: number; closed: number }> {
    return { emailed: await this.emailDue(now), closed: await this.closeDue(now) };
  }

  private closesOn(endedAt: Date) {
    return new Date(endedAt.getTime() + CLOSE_AFTER_DAYS * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** Email k is due k months after the subscription ended, and never less than 25 days after the one before (a long-lapsed patient is not sent a run of them). */
  private async emailDue(now: Date): Promise<number> {
    const portalUrl = this.config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3000';
    const candidates = await this.prisma.patient.findMany({
      where: { activatedAt: { not: null }, subscriptionEndedAt: { not: null, lte: new Date(now.getTime() - MONTH_DAYS * DAY) }, accessClosedAt: null, lapsedEmailsSent: { lt: LAPSED_EMAILS } },
      select: { id: true, email: true, firstName: true, subscriptionEndedAt: true, lapsedEmailsSent: true, lapsedEmailAt: true },
      take: BATCH,
    });
    let sent = 0;
    for (const p of candidates) {
      const next = p.lapsedEmailsSent + 1;
      if (p.subscriptionEndedAt!.getTime() > now.getTime() - next * MONTH_DAYS * DAY) continue;
      if (p.lapsedEmailAt && p.lapsedEmailAt.getTime() > now.getTime() - 25 * DAY) continue;
      // Claimed before it goes out, so two runs at once send one email; a claim whose email fails is handed back.
      const claimed = await this.prisma.patient.updateMany({ where: { id: p.id, lapsedEmailsSent: p.lapsedEmailsSent, accessClosedAt: null, subscriptionEndedAt: { not: null } }, data: { lapsedEmailsSent: next, lapsedEmailAt: now } });
      if (claimed.count === 0) continue;
      try {
        await this.email.sendLapsedEmail(p.email, p.firstName, { month: next, of: LAPSED_EMAILS, portalUrl, closesOn: this.closesOn(p.subscriptionEndedAt!) });
        sent++;
      } catch (err: any) {
        this.logger.error(`Lapsed email ${next} to ${p.id} failed: ${err?.message}`);
        await this.prisma.patient.updateMany({ where: { id: p.id, lapsedEmailsSent: next }, data: { lapsedEmailsSent: p.lapsedEmailsSent, lapsedEmailAt: p.lapsedEmailAt } });
      }
    }
    return sent;
  }

  /** Closes the sign-in of patients who have had all six emails, a month after the last, and tells them. Records are kept. */
  private async closeDue(now: Date): Promise<number> {
    const due = await this.prisma.patient.findMany({
      where: {
        activatedAt: { not: null },
        accessClosedAt: null,
        subscriptionEndedAt: { not: null, lte: new Date(now.getTime() - CLOSE_AFTER_DAYS * DAY) },
        lapsedEmailsSent: { gte: LAPSED_EMAILS },
        lapsedEmailAt: { lte: new Date(now.getTime() - 25 * DAY) },
      },
      select: { id: true, email: true, firstName: true },
      take: BATCH,
    });
    let closed = 0;
    for (const p of due) {
      const { count } = await this.prisma.patient.updateMany({ where: { id: p.id, accessClosedAt: null, subscriptionEndedAt: { not: null } }, data: { accessClosedAt: now, accessClosedReason: 'LAPSED', tokenVersion: { increment: 1 } } });
      if (count === 0) continue;
      closed++;
      await this.audit.log({ actorId: 'system:lapsed', actorRole: UserRole.ADMIN, action: 'ACCESS_CLOSED', resourceType: 'Patient', resourceId: p.id, patientId: p.id, metadata: { reason: 'LAPSED' } });
      await this.email.sendLapsedClosedEmail(p.email, p.firstName).catch((err: any) => this.logger.error(`Account closed email to ${p.id} failed: ${err?.message}`));
    }
    return closed;
  }
}
