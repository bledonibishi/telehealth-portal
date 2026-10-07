import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../stripe/billing.service';
import { DosePricingService } from '../stripe/dose-pricing.service';
import { planFor, planPriceEnvVars } from '../stripe/plan-pricing';
import { EmailService } from '../email/email.service';
import { MessagingService } from '../messaging/messaging.service';
import { OrdersService } from '../prescriptions/orders.service';
import { PartnerOrdersService } from '../prescriptions/partner-orders.service';
import { PrescribingService } from '../prescriptions/prescribing.service';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { CheckInOutcome, CheckInStatus, ConsultationKind, UserRole } from '../common/enums';
import { ReviewCheckInInput } from './dto/review-check-in.input';

const HEADLINE: Record<CheckInOutcome, string> = {
  [CheckInOutcome.REPEAT]: 'Your next supply is on its way',
  [CheckInOutcome.NEW_PRESCRIPTION]: 'Your clinician has updated your treatment',
  [CheckInOutcome.HOLD]: 'An update on your treatment',
  [CheckInOutcome.STOP]: 'An update on your treatment',
};

/**
 * A doctor's decision on a completed monthly check-in, and everything that
 * follows from it: the next supply (a repeat or a new prescription, e.g. the
 * next titration step), or a hold or stop — with the matching billing change.
 */
@Injectable()
export class CheckInReviewService {
  private readonly logger = new Logger(CheckInReviewService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private billing: BillingService,
    private email: EmailService,
    private messaging: MessagingService,
    private orders: OrdersService,
    private prescribing: PrescribingService,
    private prescriptions: PrescriptionsService,
    private config: ConfigService,
    private partner: PartnerOrdersService,
    private dosePricing: DosePricingService,
  ) {}

  async queue() {
    const rows = await this.prisma.checkIn.findMany({
      where: { status: CheckInStatus.COMPLETED, reviewedAt: null },
      include: { patient: true, prescription: true },
      orderBy: { completedAt: 'asc' },
    });
    // Critical first, then warning, then unflagged — a stable sort keeps each
    // group in the completedAt-ascending order the query already returned.
    const severityRank = (c: { redFlags: unknown }) => {
      const flags = c.redFlags as Array<{ severity: string }>;
      if (flags.some((f) => f.severity === 'CRITICAL')) return 2;
      if (flags.some((f) => f.severity === 'WARNING')) return 1;
      return 0;
    };
    return rows.sort((a, b) => severityRank(b) - severityRank(a));
  }

  async findById(id: string) {
    const checkIn = await this.prisma.checkIn.findUnique({
      where: { id },
      include: { patient: true, prescription: true, reviewedBy: true },
    });
    if (!checkIn) throw new NotFoundException('Check-in not found');
    return checkIn;
  }

  async review(clinicianId: string, input: ReviewCheckInInput) {
    const checkIn = await this.findById(input.checkInId);
    if (checkIn.status !== CheckInStatus.COMPLETED) throw new BadRequestException('The patient hasn’t completed this check-in yet');
    if (checkIn.reviewedAt) throw new ConflictException('This check-in has already been reviewed');

    const rx = checkIn.prescription;
    const patient = checkIn.patient;
    let resultOrderId: string | null = null;
    let resultPrescriptionId: string | null = null;
    let billingNote: string;

    switch (input.outcome) {
      case CheckInOutcome.REPEAT: {
        if (!rx) throw new BadRequestException('There is no current prescription to repeat — issue a new one');
        const order = await this.orders.createRepeat(clinicianId, rx.id);
        resultOrderId = order.id;
        billingNote = await this.billing.resume(patient);
        break;
      }

      case CheckInOutcome.NEW_PRESCRIPTION: {
        if (!input.items?.length) throw new BadRequestException('Choose the medicine for the new prescription');
        await this.prescribing.assertCanPrescribe(clinicianId);
        await this.prescribing.assertIdentityVerified(patient.id);
        if (!checkIn.kind) throw new BadRequestException('This check-in has no programme recorded');
        const kind = checkIn.kind as ConsultationKind;

        // The rules also need the intake answers (e.g. whether the patient has a uterus).
        const consultation = await this.prisma.consultation.findFirst({
          where: { patientId: patient.id, kind },
          orderBy: { submittedAt: 'desc' },
        });
        const answers = [...((consultation?.quizAnswers as any[]) ?? []), ...((checkIn.answers as any[]) ?? [])];

        const issued = await this.prisma.$transaction((tx) =>
          this.prescribing.issue(
            {
              patientId: patient.id,
              prescriberId: clinicianId,
              kind,
              answers,
              items: input.items!,
              supersedesId: rx?.status === 'ACTIVE' ? rx.id : undefined,
              notes: input.notes,
              validityDays: input.validityDays,
              refillsAllowed: input.refillsAllowed,
              overrideReason: input.overrideReason,
            },
            tx,
          ),
        );
        resultPrescriptionId = issued.id;
        resultOrderId = (await this.prisma.order.findFirst({ where: { prescriptionId: issued.id, sequence: 1 } }))?.id ?? null;
        if (resultOrderId) await this.partner.trySend(resultOrderId);
        billingNote = await this.movePlan(patient, kind, issued.id);
        break;
      }

      case CheckInOutcome.HOLD:
        billingNote = await this.billing.pause(patient);
        break;

      case CheckInOutcome.STOP:
        if (rx?.status === 'ACTIVE') {
          await this.prescriptions.cancel(clinicianId, rx.id, input.note?.trim() || 'Treatment stopped at monthly check-in');
        }
        billingNote = await this.billing.cancelAtPeriodEnd(patient);
        break;

      default:
        throw new BadRequestException('Unknown outcome');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.checkIn.update({
        where: { id: checkIn.id },
        data: {
          reviewedAt: new Date(),
          reviewedById: clinicianId,
          outcome: input.outcome,
          reviewNote: input.note?.trim() || null,
          billingNote,
          resultOrderId,
          resultPrescriptionId,
        },
        include: { patient: true, prescription: true, reviewedBy: true },
      });
      await this.audit.log(
        {
          actorId: clinicianId,
          actorRole: UserRole.CLINICIAN,
          action: 'CHECK_IN_REVIEWED',
          resourceType: 'CheckIn',
          resourceId: checkIn.id,
          patientId: patient.id,
          metadata: { outcome: input.outcome, resultOrderId, resultPrescriptionId, billingNote },
        },
        tx,
      );
      return reviewed;
    });

    await this.notifyPatient(patient, clinicianId, HEADLINE[input.outcome], input.messageToPatient);
    return updated;
  }

  // A new dose has its own price (or, for doses not priced individually, can mean a different plan tier).
  private async movePlan(patient: Parameters<BillingService['changePrice']>[0], kind: ConsultationKind, prescriptionId: string) {
    const items = await this.prisma.prescriptionItem.findMany({
      where: { prescriptionId },
      include: { product: true, strength: true },
    });
    const priced = items.map((i) => ({ category: i.product.category, titrationStep: i.strength.titrationStep, stripePriceId: i.strength.stripePriceId }));
    const priceIds = this.dosePricing.priceIdsFor(kind, priced);
    const resumed = await this.billing.resume(patient);
    if (!priceIds) return `${resumed}. No price for this dose and no ${planPriceEnvVars(planFor(kind, priced))[0]} configured — check the plan in Stripe`;
    return `${resumed}. ${await this.billing.changePrice(patient, priceIds)}`;
  }

  // Messages live on consultation threads; use the patient's latest one.
  private async notifyPatient(patient: { id: string; email: string; firstName: string }, clinicianId: string, headline: string, message?: string) {
    try {
      if (message?.trim()) {
        const thread = await this.prisma.consultation.findFirst({ where: { patientId: patient.id }, orderBy: { submittedAt: 'desc' } });
        if (thread) await this.messaging.send(clinicianId, UserRole.CLINICIAN, { consultationId: thread.id, content: message.trim() });
      }
      const portal = this.config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3000';
      await this.email.sendConsultationUpdateEmail(patient.email, patient.firstName, headline, `${portal}/dashboard`);
    } catch (err: any) {
      this.logger.error(`Check-in notification failed: ${err?.message}`);
    }
  }
}
