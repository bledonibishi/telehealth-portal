import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CheckInStatus } from '../common/enums';
import { SubmitCheckInInput } from './dto/submit-check-in.input';

const CHECK_IN_INTERVAL_DAYS = 30;
const TOKEN_EXPIRY_DAYS = 14;

@Injectable()
export class CheckInsService {
  private readonly logger = new Logger(CheckInsService.name);
  private readonly appUrl: string;

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    config: ConfigService,
  ) {
    this.appUrl = config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3000';
  }

  /**
   * Keeps every activated patient with exactly one open (not-yet-completed)
   * check-in scheduled, spaced CHECK_IN_INTERVAL_DAYS apart. Runs frequently
   * so newly-activated patients and freshly-completed check-ins get their
   * next one queued promptly rather than once a day.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async ensureScheduled() {
    const patients = await this.prisma.patient.findMany({
      where: { activatedAt: { not: null } },
      include: { checkIns: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    for (const patient of patients) {
      const latest = patient.checkIns[0];
      if (latest && latest.status !== CheckInStatus.COMPLETED) continue;

      const baseDate = latest?.completedAt ?? patient.activatedAt!;
      const dueAt = new Date(baseDate.getTime() + CHECK_IN_INTERVAL_DAYS * 86_400_000);

      await this.prisma.checkIn.create({ data: { patientId: patient.id, dueAt } });
      this.logger.log(`Scheduled check-in for ${patient.email}, due ${dueAt.toISOString()}`);
    }
  }

  /** Emails out any check-in whose due date has arrived. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendDue() {
    const due = await this.prisma.checkIn.findMany({
      where: { status: CheckInStatus.SCHEDULED, dueAt: { lte: new Date() } },
      include: { patient: true },
    });

    for (const checkIn of due) {
      const token = randomBytes(32).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 86_400_000);

      await this.prisma.checkIn.update({
        where: { id: checkIn.id },
        data: { status: CheckInStatus.SENT, sentAt: new Date(), token, tokenExpiresAt },
      });

      const url = this.buildUrl(token)!;
      await this.email.sendCheckInEmail(checkIn.patient.email, checkIn.patient.firstName, url);
      this.logger.log(`Sent check-in email to ${checkIn.patient.email}`);
    }
  }

  async reschedule(id: string, dueAt: Date) {
    const checkIn = await this.prisma.checkIn.findUnique({ where: { id } });
    if (!checkIn) throw new NotFoundException('Check-in not found');
    if (checkIn.status !== CheckInStatus.SCHEDULED) {
      throw new BadRequestException('Only a not-yet-sent check-in can be rescheduled');
    }

    const updated = await this.prisma.checkIn.update({ where: { id }, data: { dueAt } });
    return this.toModel(updated);
  }

  buildUrl(token?: string | null) {
    return token ? `${this.appUrl}/checkin?token=${token}` : null;
  }

  private toModel(checkIn: any) {
    return {
      ...checkIn,
      patientFirstName: checkIn.patient?.firstName,
      checkInUrl: this.buildUrl(checkIn.token),
    };
  }

  async findByToken(token: string) {
    const checkIn = await this.prisma.checkIn.findUnique({ where: { token }, include: { patient: true } });
    if (!checkIn) throw new NotFoundException('This check-in link is invalid');
    if (checkIn.status === CheckInStatus.COMPLETED) {
      throw new BadRequestException('This check-in has already been completed');
    }
    if (!checkIn.tokenExpiresAt || checkIn.tokenExpiresAt < new Date()) {
      throw new BadRequestException('This link has expired');
    }
    return this.toModel(checkIn);
  }

  async submit(token: string, input: SubmitCheckInInput) {
    // Re-validates the token (expiry / already-completed) before writing.
    await this.findByToken(token);

    const updated = await this.prisma.checkIn.update({
      where: { token },
      data: {
        status: CheckInStatus.COMPLETED,
        completedAt: new Date(),
        answers: input.answers as any,
        wantsToReorder: input.wantsToReorder,
        token: null,
        tokenExpiresAt: null,
      },
      include: { patient: true },
    });
    return this.toModel(updated);
  }
}
