import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ConsultationKind, RiskTag } from '../common/enums';
import { triageEligibility } from '../questionnaires/triage';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** First reminder after a day without activity, the last four days after that, and nothing for anyone idle over a month. */
export const FIRST_REMINDER_AFTER_MS = DAY;
export const SECOND_REMINDER_AFTER_MS = 4 * DAY;
export const STOP_AFTER_MS = 30 * DAY;
export const MAX_REMINDERS = 2;
const BATCH = 50;

// Where each programme's own website page starts. The link says which programme it is, but nothing about the person.
const START_PATH: Record<string, string> = { GLP1: '/glp1-eligibility', HRT: '/hrt-eligibility', TRT: '/trt-eligibility' };

/**
 * "Finish your order" emails to leads who answered the questions but never paid: one after a day, a last one four
 * days later. Off unless LEAD_REMINDERS_ENABLED=true, because sending marketing-style email to people who haven't
 * bought is regulated and has to be cleared first. Never sent to someone the triage ruled out, someone who has paid,
 * or someone who clicked "stop" in an earlier one.
 */
@Injectable()
export class LeadRemindersService {
  private readonly logger = new Logger(LeadRemindersService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  get enabled() {
    return this.config.get<string>('LEAD_REMINDERS_ENABLED') === 'true';
  }

  private sign(leadId: string) {
    const secret = this.config.get<string>('JWT_SECRET') ?? '';
    return createHmac('sha256', secret).update(`lead-reminders:${leadId}`).digest('hex');
  }

  unsubscribeUrl(leadId: string) {
    const base = (this.config.get<string>('API_PUBLIC_URL')?.trim() || 'http://localhost:4000').replace(/\/$/, '');
    return `${base}/leads/unsubscribe?lead=${encodeURIComponent(leadId)}&sig=${this.sign(leadId)}`;
  }

  /** Stops the reminders for a lead whose link checks out. False for a link that doesn't (so nobody can stop someone else's). */
  async unsubscribe(leadId: string, sig: string) {
    const expected = Buffer.from(this.sign(leadId));
    const given = Buffer.from(sig ?? '');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    await this.prisma.lead.updateMany({ where: { id: leadId, remindersStoppedAt: null }, data: { remindersStoppedAt: new Date() } });
    return true;
  }

  @Cron(CronExpression.EVERY_HOUR)
  /** `onlyEmailStartingWith` narrows a run to some leads (the dev test command uses it so only example leads are ever touched). */
  async sendDue(now = new Date(), onlyEmailStartingWith?: string) {
    if (!this.enabled) return 0;
    const site = (this.config.get<string>('WEBFLOW_SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    const leads = await this.prisma.lead.findMany({
      where: {
        ...(onlyEmailStartingWith ? { email: { startsWith: onlyEmailStartingWith } } : {}),
        convertedAt: null,
        remindersStoppedAt: null,
        reminderCount: { lt: MAX_REMINDERS },
        // They reached the plans: the health questions are done. Anyone who already has an account is not a lead any more.
        intakeSavedAt: { not: null },
        patient: null,
        updatedAt: { gte: new Date(now.getTime() - STOP_AFTER_MS), lte: new Date(now.getTime() - FIRST_REMINDER_AFTER_MS) },
      },
      orderBy: { updatedAt: 'asc' },
      take: BATCH,
    });

    let sent = 0;
    for (const lead of leads) {
      if (triageEligibility(lead.productKind as ConsultationKind, lead.quizAnswers as any[]).riskTag === RiskTag.RED) continue;
      if (lead.reminderCount > 0 && (!lead.lastReminderAt || now.getTime() - lead.lastReminderAt.getTime() < SECOND_REMINDER_AFTER_MS)) continue;

      const last = lead.reminderCount + 1 >= MAX_REMINDERS;
      const accepted = await this.email.sendLeadReminderEmail(
        lead.email,
        lead.firstName,
        `${site}${START_PATH[lead.productKind] ?? '/'}`,
        this.unsubscribeUrl(lead.id),
        last,
      );
      if (!accepted) continue;
      // Keep the lead's own "last activity" as it was: sending a reminder isn't the lead doing anything.
      await this.prisma.lead.update({ where: { id: lead.id }, data: { reminderCount: { increment: 1 }, lastReminderAt: now, updatedAt: lead.updatedAt } });
      sent++;
    }
    if (sent) this.logger.log(`Sent ${sent} lead reminder${sent === 1 ? '' : 's'}`);
    return sent;
  }
}
