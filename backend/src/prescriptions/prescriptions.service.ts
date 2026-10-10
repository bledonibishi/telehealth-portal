import { Injectable, BadRequestException, Logger, NotFoundException, Optional } from '@nestjs/common';
import { NotificationKind } from '@telehealth/shared-types';
import { NotifierService } from '../notifications/notifier.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { MessagingService } from '../messaging/messaging.service';
import { ConsultationKind, PrescriptionStatus, UserRole } from '../common/enums';
import { OrdersService } from './orders.service';
import { DosingService } from '../dosing/dosing.service';
import { PartnerOrdersService } from './partner-orders.service';
import { PrescribingService } from './prescribing.service';
import { ChangeDoseInput } from './dto/change-dose.input';

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private orders: OrdersService,
    private dosing: DosingService,
    private prescribing: PrescribingService,
    private messaging: MessagingService,
    private email: EmailService,
    private config: ConfigService,
    private partner: PartnerOrdersService,
    @Optional() private notifier?: NotifierService,
  ) {}

  async findById(id: string) {
    const rx = await this.prisma.prescription.findUnique({ where: { id } });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  findByPatient(patientId: string) {
    return this.prisma.prescription.findMany({ where: { patientId }, orderBy: { issuedAt: 'desc' } });
  }

  async cancel(clinicianId: string, id: string, reason: string) {
    if (!reason.trim()) throw new BadRequestException('A reason is required to cancel a prescription');
    const rx = await this.findById(id);
    if (rx.status !== PrescriptionStatus.ACTIVE) {
      throw new BadRequestException(`Only an active prescription can be cancelled (this one is ${rx.status.toLowerCase()})`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.orders.cancelPendingFor(id, `Prescription cancelled: ${reason.trim()}`, tx);
      await this.dosing.cancelForPrescription(id, tx);
      const cancelled = await tx.prescription.update({
        where: { id },
        data: { status: PrescriptionStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason.trim() },
      });
      await this.audit.log(
        {
          actorId: clinicianId,
          actorRole: UserRole.CLINICIAN,
          action: 'PRESCRIPTION_CANCELLED',
          resourceType: 'Prescription',
          resourceId: id,
          patientId: rx.patientId,
          metadata: { reason: reason.trim() },
        },
        tx,
      );
      return cancelled;
    });
    // Orders already handed to the pharmacy partner are withdrawn there too.
    await this.partner.flushCancellations();
    return updated;
  }

  findByConsultation(consultationId: string) {
    return this.prisma.prescription.findUnique({ where: { consultationId } });
  }

  /**
   * A clinician changing a patient's dose outside the monthly check-in flow —
   * e.g. stepping up a GLP-1 titration early, or switching HRT products.
   * Goes through the same rule engine and supersede/reissue path as every
   * other prescribing decision (PrescribingService.issue).
   */
  async changeDose(clinicianId: string, input: ChangeDoseInput) {
    if (!input.reasonForChange.trim()) throw new BadRequestException('A clinical reason is required to change the dose');
    if (!input.items.length) throw new BadRequestException('Choose at least one medicine');

    const current = await this.findById(input.prescriptionId);
    if (current.status !== PrescriptionStatus.ACTIVE) {
      throw new BadRequestException(`Only an active prescription can have its dose changed (this one is ${current.status.toLowerCase()})`);
    }

    await this.prescribing.assertCanPrescribe(clinicianId);
    await this.prescribing.assertIdentityVerified(current.patientId);

    const product = await this.prisma.product.findUnique({ where: { id: input.items[0].productId } });
    if (!product) throw new BadRequestException('Unknown product');

    // The prescribing rules need the patient's intake answers, same as at initial approval.
    const consultation = await this.prisma.consultation.findFirst({
      where: { patientId: current.patientId, kind: product.kind },
      orderBy: { submittedAt: 'desc' },
    });
    const answers = (consultation?.quizAnswers as any[]) ?? [];

    const issued = await this.prisma.$transaction(async (tx) => {
      const rx = await this.prescribing.issue(
        {
          patientId: current.patientId,
          prescriberId: clinicianId,
          kind: product.kind as ConsultationKind,
          answers,
          items: input.items,
          supersedesId: current.id,
          notes: input.notes,
          validityDays: input.validityDays,
          refillsAllowed: input.refillsAllowed,
          overrideReason: input.overrideReason,
        },
        tx,
      );
      // Same transaction as the change: a dose change that can't be recorded doesn't happen.
      await this.audit.log(
        {
          actorId: clinicianId,
          actorRole: UserRole.CLINICIAN,
          action: 'DOSE_CHANGED',
          resourceType: 'Prescription',
          resourceId: rx.id,
          patientId: current.patientId,
          metadata: { supersedes: current.id, reason: input.reasonForChange.trim(), medication: rx.medication },
        },
        tx,
      );
      return rx;
    });

    const patient = await this.prisma.patient.findUnique({ where: { id: current.patientId } });
    if (patient) await this.notifyPatient(patient, clinicianId, input.messageToPatient);

    // The new dose's first supply replaces any unsent order — pass it to the pharmacy partner.
    await this.partner.trySendForPrescription(issued.id);

    return issued;
  }

  // Best effort: a failed email or message must not undo a dose change that is already saved.
  private async notifyPatient(patient: { id: string; email: string; firstName: string }, clinicianId: string, message?: string) {
    await this.notifier?.toPatient(patient.id, { kind: NotificationKind.TREATMENT_UPDATE, params: { headline: 'Your dose has been updated' }, href: '/dashboard' });
    try {
      if (message?.trim()) {
        const thread = await this.prisma.consultation.findFirst({ where: { patientId: patient.id }, orderBy: { submittedAt: 'desc' } });
        if (thread) await this.messaging.send(clinicianId, UserRole.CLINICIAN, { consultationId: thread.id, content: message.trim() });
      }
      const portal = this.config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3000';
      await this.email.sendConsultationUpdateEmail(patient.email, patient.firstName, 'Your dose has been updated', `${portal}/dashboard`);
    } catch (err: any) {
      this.logger.error(`Dose-change notification failed: ${err?.message}`);
    }
  }
}
