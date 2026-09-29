import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CheckInStatus, ConsultationKind, PrescriptionStatus } from '../common/enums';
import { SubmitCheckInInput } from './dto/submit-check-in.input';
import { findQuestionnaire, versionTag } from '../questionnaires/definitions';
import { evaluateAnswers } from '../questionnaires/evaluate';

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
   * Keeps every patient on treatment (an active prescription) with exactly one
   * open (not-yet-completed) check-in scheduled, spaced CHECK_IN_INTERVAL_DAYS
   * apart from their first prescription. Runs frequently so new prescriptions
   * and freshly-completed check-ins get their next one queued promptly.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async ensureScheduled() {
    const patients = await this.prisma.patient.findMany({
      where: { activatedAt: { not: null }, prescriptions: { some: { status: PrescriptionStatus.ACTIVE } } },
      include: {
        checkIns: { orderBy: { createdAt: 'desc' }, take: 1 },
        prescriptions: { orderBy: { issuedAt: 'asc' }, take: 1 },
      },
    });

    for (const patient of patients) {
      const latest = patient.checkIns[0];
      if (latest && latest.status !== CheckInStatus.COMPLETED) continue;

      const baseDate = latest?.completedAt ?? patient.prescriptions[0].issuedAt;
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

  // The treatment being checked in on: the patient's most recent active
  // prescription, and which programme it belongs to.
  private async currentTreatment(patientId: string) {
    const rx = await this.prisma.prescription.findFirst({
      where: { patientId, status: PrescriptionStatus.ACTIVE },
      orderBy: { issuedAt: 'desc' },
      include: { items: { include: { product: true } } },
    });
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, include: { lead: true } });
    const kind = (rx?.items[0]?.product.kind ?? patient?.lead?.productKind ?? null) as ConsultationKind | null;
    return { prescription: rx, kind };
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
    // The form needs to know which programme's questions to show.
    const { kind } = await this.currentTreatment(checkIn.patientId);
    return this.toModel({ ...checkIn, kind });
  }

  async submit(token: string, input: SubmitCheckInInput) {
    // Re-validates the token (expiry / already-completed) before writing.
    const checkIn = await this.findByToken(token);
    const { prescription, kind } = await this.currentTreatment(checkIn.patientId);
    if (!kind) throw new BadRequestException('We couldn’t find your treatment — please contact us');

    const questionnaire = findQuestionnaire(kind, 'CHECKIN');
    const evaluation = evaluateAnswers(questionnaire, input.answers, true);
    if (evaluation.errors.length) throw new BadRequestException(evaluation.errors.join(' '));

    const updated = await this.prisma.checkIn.update({
      where: { token },
      data: {
        status: CheckInStatus.COMPLETED,
        completedAt: new Date(),
        answers: evaluation.answers as any,
        redFlags: evaluation.flags as any,
        kind,
        questionnaireVersion: versionTag(questionnaire),
        prescriptionId: prescription?.id ?? null,
        wantsToReorder: input.wantsToReorder,
        token: null,
        tokenExpiresAt: null,
      },
      include: { patient: true },
    });
    return this.toModel(updated);
  }
}
