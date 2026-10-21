import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingService } from '../stripe/billing.service';
import { CONSULT_FEE_CURRENCY, CONSULT_PAYMENT_DAYS, consultFeeCents, consultIsCharged } from './consult-fee';
import { NotificationKind } from '@telehealth/shared-types';
import { NotifierService } from '../notifications/notifier.service';
import { ConfigService } from '@nestjs/config';
import { AppointmentRequest, AppointmentStatus, Booking, Clinician } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { BookingService } from '../booking/booking.service';
import { ClinicianRole, UserRole } from '../common/enums';
import { AppointmentAlertModel, AppointmentRequestModel, RequestAppointmentInput, ScheduleAppointmentInput } from './models/appointment.model';
import { EMERGENCY_ADVICE, MAX_DETAILS_LENGTH, MAX_OPEN_REQUESTS, RED_FLAGS, byPriority, triage } from './triage';

const OPEN: AppointmentStatus[] = ['REQUESTED', 'SCHEDULED'];
/** Cancellable by the patient, and counted against their limit of waiting requests. */
const WAITING: AppointmentStatus[] = ['AWAITING_PAYMENT', 'REQUESTED'];

/** How each reason reads to the doctor on the booking in their calendar. */
const REASON_LABEL: Record<string, string> = { QUESTION: 'A question', CHECK_UP: 'Check-up', SIDE_EFFECT: 'Side effect', PAIN: 'Pain', DOSE_CHANGE: 'Dose change', OTHER: 'Something else' };

/** What a patient books when they pick their own time: one Cal.com event type per urgency (see booking/README.md). */
export const BOOKING_PURPOSE = { ROUTINE: 'APPOINTMENT_ROUTINE', URGENT: 'APPOINTMENT_URGENT' } as const;
const PURPOSES = Object.values(BOOKING_PURPOSE);
type Row = AppointmentRequest & { handledBy?: Pick<Clinician, 'firstName' | 'lastName'> | null };

/**
 * Patients asking to see a doctor, and the clinical team answering. Urgent requests (warning signs, severe
 * pain, or the patient saying it can't wait) must be answered within 24 hours; the rest within 3 days.
 */
// One notification per urgent request, done once a doctor answers it.
const appointmentKey = (id: string) => `appt:${id}`;

@Injectable()
export class AppointmentsService implements OnModuleInit {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private email: EmailService,
    private config: ConfigService,
    private bookings: BookingService,
    @Optional() private notifier?: NotifierService,
    @Optional() private moduleRef?: ModuleRef,
  ) {}

  private get billing() {
    return this.moduleRef?.get(BillingService, { strict: false });
  }

  /** What an extra consultation costs, for the patient to see before they ask for one. */
  consultFee() {
    return { amountCents: consultFeeCents(this.config), currency: CONSULT_FEE_CURRENCY };
  }

  /** Appointments are the booking system's first customer: the patient picks a time for a request they have made. */
  onModuleInit() {
    const authorize = (urgency: 'ROUTINE' | 'URGENT') => async (patientId: string, referenceId: string | null) => {
      const row = referenceId ? await this.prisma.appointmentRequest.findUnique({ where: { id: referenceId } }) : null;
      if (!row || row.patientId !== patientId) throw new NotFoundException('Appointment not found');
      if (!OPEN.includes(row.status)) throw new BadRequestException(`This appointment is already ${row.status.toLowerCase()}`);
      // The urgent diary is for requests triage made urgent, not for anyone who would like an earlier slot.
      if (row.urgency !== urgency) throw new BadRequestException('This request can’t be booked in that diary');
    };
    // The doctor sees what the appointment is about on the booking itself: the category the patient chose and
    // whether it is urgent — not what they wrote, which stays in the portal.
    const describe = async (_patientId: string, referenceId: string | null) => {
      const row = referenceId ? await this.prisma.appointmentRequest.findUnique({ where: { id: referenceId }, select: { reason: true, urgency: true } }) : null;
      return row ? `Reason: ${REASON_LABEL[row.reason] ?? row.reason}${row.urgency === 'URGENT' ? ' · URGENT' : ''}. Details are in the clinician portal under Appointments.` : null;
    };
    this.bookings.register(
      { key: BOOKING_PURPOSE.ROUTINE, label: 'An appointment with your doctor', requiresReference: true, authorize: authorize('ROUTINE'), describe, onChange: (b) => this.onBookingChange(b) },
      { key: BOOKING_PURPOSE.URGENT, label: 'An urgent appointment with your doctor', requiresReference: true, authorize: authorize('URGENT'), describe, onChange: (b) => this.onBookingChange(b) },
    );
  }

  /** Keeps the request in step with the diary: booked when a time is confirmed, waiting again if that time is given up. */
  private async onBookingChange(b: Booking) {
    if (!b.referenceId) return;
    const row = await this.prisma.appointmentRequest.findUnique({ where: { id: b.referenceId } });
    if (!row || !OPEN.includes(row.status)) return;
    const actor = { actorId: 'system:booking', actorRole: UserRole.ADMIN };

    if (b.status === 'CONFIRMED') {
      // The provider may repeat itself; a request already showing this time needs nothing.
      if (row.status === 'SCHEDULED' && row.scheduledFor?.getTime() === b.startsAt.getTime() && row.meetingUrl === b.meetingUrl) return;
      await this.transition(actor.actorId, actor.actorRole, row, OPEN, { status: 'SCHEDULED', scheduledFor: b.startsAt, meetingUrl: b.meetingUrl, ...(b.clinicianId && { handledById: b.clinicianId }) }, 'APPOINTMENT_SCHEDULED');
    } else if ((b.status === 'CANCELLED' || b.status === 'REJECTED') && row.status === 'SCHEDULED' && row.scheduledFor?.getTime() === b.startsAt.getTime()) {
      await this.transition(actor.actorId, actor.actorRole, row, ['SCHEDULED'], { status: 'REQUESTED', scheduledFor: null, meetingUrl: null }, 'APPOINTMENT_UNSCHEDULED');
      // Waiting for a doctor again: an urgent one must reach them again, it is still due within 24 hours of the original request.
      if (row.urgency === 'URGENT') await this.alertDoctors(row.patientId, row.id).catch((err) => this.logger.error(`Alerting doctors about reopened request ${row.id} failed: ${err?.message}`, err?.stack));
    } else if (b.status === 'COMPLETED' && row.status === 'SCHEDULED') {
      await this.transition(actor.actorId, actor.actorRole, row, ['SCHEDULED'], { status: 'COMPLETED' }, 'APPOINTMENT_COMPLETED');
    }
  }

  private purposeOf(r: Pick<AppointmentRequest, 'urgency' | 'status'>) {
    const key = r.urgency === 'URGENT' ? BOOKING_PURPOSE.URGENT : BOOKING_PURPOSE.ROUTINE;
    return OPEN.includes(r.status) && this.bookings.available(key) ? key : null;
  }

  async request(patientId: string, input: RequestAppointmentInput): Promise<AppointmentRequestModel> {
    // The reason is what the request is about; words are optional.
    const details = input.details?.trim() ?? '';
    if (details.length > MAX_DETAILS_LENGTH) throw new BadRequestException(`Please keep it under ${MAX_DETAILS_LENGTH} characters`);
    if (input.painLevel != null && (!Number.isInteger(input.painLevel) || input.painLevel < 0 || input.painLevel > 10)) {
      throw new BadRequestException('Pain is scored from 0 to 10');
    }
    const redFlags = [...new Set(input.redFlags ?? [])];
    if (redFlags.some((f) => !(f in RED_FLAGS))) throw new BadRequestException('Unknown warning sign');

    const open = await this.prisma.appointmentRequest.count({ where: { patientId, status: { in: WAITING } } });
    if (open >= MAX_OPEN_REQUESTS) throw new BadRequestException('You already have requests waiting — your doctor will be in touch. Message them if anything changes.');

    const t = triage({ reason: input.reason, urgent: input.urgent, painLevel: input.painLevel, redFlags });
    const feeCents = consultFeeCents(this.config);
    const charged = consultIsCharged(feeCents, { reason: input.reason, urgency: t.urgency, emergencyAdvised: t.emergencyAdvised });
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appointmentRequest.create({
        data: {
          patientId,
          reason: input.reason,
          details,
          painLevel: input.painLevel ?? null,
          redFlags,
          urgency: t.urgency,
          emergencyAdvised: t.emergencyAdvised,
          respondBy: t.respondBy,
          ...(charged && { status: 'AWAITING_PAYMENT' as const, paymentAmountCents: feeCents, paymentCurrency: CONSULT_FEE_CURRENCY }),
          preferredTimes: input.preferredTimes?.trim().slice(0, 300) || null,
        },
      });
      await this.audit.log(
        { actorId: patientId, actorRole: UserRole.PATIENT, action: 'APPOINTMENT_REQUESTED', resourceType: 'AppointmentRequest', resourceId: created.id, patientId, metadata: { urgency: t.urgency, redFlags } },
        tx,
      );
      return created;
    });
    if (charged) return { ...this.toModel(await this.askForPayment(row)), advice: null };
    if (row.urgency === 'URGENT') await this.alertDoctors(patientId, row.id).catch((err) => this.logger.error(`Alerting doctors about urgent request ${row.id} failed: ${err?.message}`, err?.stack));
    return { ...this.toModel(row), advice: t.emergencyAdvised ? EMERGENCY_ADVICE : null };
  }

  /**
   * Makes the invoice for a charged request. If Stripe can't make it, the patient is not turned away for that: the request
   * goes to the doctors as a free one, and the failure is logged.
   */
  private async askForPayment(row: AppointmentRequest): Promise<AppointmentRequest> {
    try {
      const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: row.patientId }, select: { email: true, stripeCustomerId: true, stripeSubscriptionId: true } });
      const invoice = await this.billing!.createConsultInvoice(patient, row, row.paymentAmountCents!, row.paymentCurrency ?? CONSULT_FEE_CURRENCY);
      const paid = invoice.paid;
      return await this.prisma.appointmentRequest.update({
        where: { id: row.id },
        data: { paymentInvoiceId: invoice.invoiceId, paymentUrl: invoice.url, paymentAmountCents: invoice.amountCents, paymentCurrency: invoice.currency, ...(paid && { status: 'REQUESTED', paidAt: new Date() }) },
      });
    } catch (err: any) {
      this.logger.error(`Invoice for consultation ${row.id} failed, so it is free: ${err?.message}`);
      return this.prisma.appointmentRequest.update({ where: { id: row.id }, data: { status: 'REQUESTED', paymentAmountCents: null, paymentCurrency: null } });
    }
  }

  /** The consultation's invoice was paid: the request now goes to the doctors. */
  async markPaid(invoiceId: string): Promise<boolean> {
    const row = await this.prisma.appointmentRequest.findFirst({ where: { paymentInvoiceId: invoiceId, status: 'AWAITING_PAYMENT' } });
    if (!row) return false;
    const { count } = await this.prisma.appointmentRequest.updateMany({ where: { id: row.id, status: 'AWAITING_PAYMENT' }, data: { status: 'REQUESTED', paidAt: new Date() } });
    if (count === 0) return false;
    await this.audit.log({ actorId: 'system:stripe', actorRole: UserRole.ADMIN, action: 'APPOINTMENT_PAID', resourceType: 'AppointmentRequest', resourceId: row.id, patientId: row.patientId, metadata: { invoiceId } });
    return true;
  }

  /** Withdraws requests nobody paid for, with their invoices. */
  @Cron(CronExpression.EVERY_HOUR)
  async expireUnpaid(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - CONSULT_PAYMENT_DAYS * 86_400_000);
    const stale = await this.prisma.appointmentRequest.findMany({ where: { status: 'AWAITING_PAYMENT', createdAt: { lt: before } }, take: 50 });
    let n = 0;
    for (const row of stale) {
      if (row.paymentInvoiceId) await this.billing?.voidSupplyInvoice(row.paymentInvoiceId);
      const { count } = await this.prisma.appointmentRequest.updateMany({ where: { id: row.id, status: 'AWAITING_PAYMENT' }, data: { status: 'CANCELLED', cancelledAt: now } });
      n += count;
    }
    // A patient who never answered the doctor's "refund or new time" gets the refund: they paid for a consultation that did not happen.
    const unanswered = await this.prisma.appointmentRequest.findMany({ where: { status: 'CANCELLED', refundOfferedAt: { lt: before, not: null }, refundedAt: null, paidAt: { not: null } }, take: 50 });
    for (const row of unanswered) {
      try {
        await this.refund(row, 'system:consultations', UserRole.ADMIN);
        await this.notify(row.patientId, 'Your consultation was refunded');
      } catch (err: any) {
        this.logger.error(`Automatic refund for consultation ${row.id} failed: ${err?.message}`);
      }
    }
    return n;
  }

  async mine(patientId: string): Promise<AppointmentRequestModel[]> {
    const rows = await this.prisma.appointmentRequest.findMany({
      where: { patientId },
      include: { handledBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    // A consultation waiting for payment can be paid inside the portal: the secret is the patient's own, and only they get it.
    const secrets = new Map<string, string>();
    await Promise.all(
      rows.filter((r) => r.status === 'AWAITING_PAYMENT' && r.paymentInvoiceId).map(async (r) => {
        const details = await this.billing?.invoicePaymentDetails(r.paymentInvoiceId!);
        if (details) secrets.set(r.id, details.clientSecret);
      }),
    );
    return rows.map((r) => ({ ...this.toModel(r), paymentClientSecret: secrets.get(r.id) ?? null }));
  }

  async cancelMine(patientId: string, id: string) {
    const row = await this.prisma.appointmentRequest.findUnique({ where: { id } });
    if (!row || row.patientId !== patientId) throw new NotFoundException('Appointment not found');
    // Paid for: until the consultation starts the money goes back; once it has started it is a consultation that took place.
    const paid = !!row.paidAt && !row.refundedAt;
    if (paid && this.started(row)) throw new BadRequestException('The consultation has already started, so it can no longer be cancelled or refunded.');
    if (paid) await this.refund(row, patientId, UserRole.PATIENT);
    await this.bookings.cancelFor(PURPOSES, row.id, { actorId: patientId, actorRole: UserRole.PATIENT }, 'Cancelled by the patient', patientId);
    // Not paid yet: the invoice goes with it, so it can't be paid for a request that no longer exists.
    if (row.status === 'AWAITING_PAYMENT' && row.paymentInvoiceId) await this.billing?.voidSupplyInvoice(row.paymentInvoiceId);
    return this.transition(patientId, UserRole.PATIENT, row, [...OPEN, 'AWAITING_PAYMENT'], { status: 'CANCELLED', cancelledAt: new Date() }, 'APPOINTMENT_CANCELLED');
  }

  /** Everything still waiting or booked, urgent and soonest-due first. */
  async open(now = new Date()): Promise<AppointmentAlertModel[]> {
    const rows = await this.prisma.appointmentRequest.findMany({
      where: { status: { in: OPEN } },
      include: { patient: { select: { firstName: true, lastName: true } }, handledBy: { select: { firstName: true, lastName: true } } },
    });
    return rows.sort(byPriority).map((r) => ({
      ...this.toModel(r),
      patientId: r.patientId,
      patientName: `${r.patient.firstName} ${r.patient.lastName}`,
      overdue: r.status === 'REQUESTED' && r.respondBy < now,
    }));
  }

  async schedule(clinicianId: string, input: ScheduleAppointmentInput) {
    const at = new Date(input.scheduledFor);
    if (Number.isNaN(at.getTime())) throw new BadRequestException('Choose a date and time');
    const meetingUrl = input.meetingUrl?.trim() || null;
    if (meetingUrl && !/^https:\/\//i.test(meetingUrl)) throw new BadRequestException('The meeting link must start with https://');
    const row = await this.find(input.id);
    const updated = await this.transition(clinicianId, UserRole.CLINICIAN, row, OPEN, {
      status: 'SCHEDULED',
      scheduledFor: at,
      meetingUrl,
      clinicianNote: input.note?.trim() || null,
      handledById: clinicianId,
    }, 'APPOINTMENT_SCHEDULED');
    await this.notify(row.patientId, 'Your appointment is booked');
    return updated;
  }

  async complete(clinicianId: string, id: string, note?: string) {
    const row = await this.find(id);
    return this.transition(clinicianId, UserRole.CLINICIAN, row, OPEN, {
      status: 'COMPLETED',
      handledById: clinicianId,
      ...(note?.trim() && { clinicianNote: note.trim() }),
    }, 'APPOINTMENT_COMPLETED');
  }

  async cancel(clinicianId: string, id: string, note: string) {
    if (!note?.trim()) throw new BadRequestException('Tell the patient why');
    const row = await this.find(id);
    const paid = !!row.paidAt && !row.refundedAt;
    // A paid, booked time the doctor can't keep: the patient chooses between the money back and a new time.
    const offer = paid && row.status === 'SCHEDULED';
    // A paid request turned down before a time was booked: nothing was delivered, so the money goes back at once.
    if (paid && !offer) await this.refund(row, clinicianId, UserRole.CLINICIAN);
    await this.bookings.cancelFor(PURPOSES, row.id, { actorId: clinicianId, actorRole: UserRole.CLINICIAN }, note.trim(), row.patientId);
    const updated = await this.transition(clinicianId, UserRole.CLINICIAN, row, OPEN, {
      status: 'CANCELLED', cancelledAt: new Date(), clinicianNote: note.trim(), handledById: clinicianId, ...(offer && { refundOfferedAt: new Date() }),
    }, 'APPOINTMENT_CANCELLED');
    await this.notify(row.patientId, offer ? 'Your doctor can’t make your appointment: choose a refund or a new time' : paid ? 'Your appointment was cancelled and you have been refunded' : 'An update on your appointment');
    return updated;
  }

  /** The consultation is on: its time has come, or it is done. From here the payment can't be taken back. */
  private started(r: Pick<AppointmentRequest, 'status' | 'scheduledFor'>, now = new Date()) {
    return r.status === 'COMPLETED' || (r.status === 'SCHEDULED' && !!r.scheduledFor && r.scheduledFor <= now);
  }

  private canRefund(r: AppointmentRequest) {
    return !!r.paidAt && !r.refundedAt && (r.status === 'REQUESTED' || r.status === 'SCHEDULED') && !this.started(r);
  }

  /** Gives the payment back, once. The claim comes first so two taps can't refund twice; a failed refund releases it. */
  private async refund(row: AppointmentRequest, actorId: string, actorRole: UserRole) {
    if (!row.paymentInvoiceId) throw new BadRequestException('There is no payment to refund');
    const claimed = await this.prisma.appointmentRequest.updateMany({ where: { id: row.id, paidAt: { not: null }, refundedAt: null }, data: { refundedAt: new Date() } });
    if (claimed.count === 0) return;
    try {
      const { refundId } = await this.billing!.refundConsultInvoice(row.paymentInvoiceId);
      await this.prisma.appointmentRequest.update({ where: { id: row.id }, data: { refundId } });
    } catch (err: any) {
      await this.prisma.appointmentRequest.updateMany({ where: { id: row.id }, data: { refundedAt: null } });
      this.logger.error(`Refund for consultation ${row.id} failed: ${err?.message}`);
      throw new BadRequestException('We couldn’t refund this payment just now. Nothing has changed; please try again, or contact us.');
    }
    await this.audit.log({ actorId, actorRole, action: 'APPOINTMENT_REFUNDED', resourceType: 'AppointmentRequest', resourceId: row.id, patientId: row.patientId, metadata: { invoiceId: row.paymentInvoiceId } });
  }

  private async offered(patientId: string, id: string) {
    const row = await this.prisma.appointmentRequest.findUnique({ where: { id } });
    if (!row || row.patientId !== patientId) throw new NotFoundException('Appointment not found');
    if (row.status !== 'CANCELLED' || !row.refundOfferedAt || row.refundedAt || !row.paidAt) throw new BadRequestException('There is nothing to choose for this appointment');
    return row;
  }

  /** The doctor couldn't make it and the patient wants the money back. */
  async chooseRefund(patientId: string, id: string) {
    const row = await this.offered(patientId, id);
    await this.refund(row, patientId, UserRole.PATIENT);
    return this.toModel(await this.prisma.appointmentRequest.findUniqueOrThrow({ where: { id }, include: { handledBy: { select: { firstName: true, lastName: true } } } }));
  }

  /** The doctor couldn't make it and the patient keeps the payment for a new time: back to the doctors' list, due again. */
  async chooseReschedule(patientId: string, id: string) {
    const row = await this.offered(patientId, id);
    const { count } = await this.prisma.appointmentRequest.updateMany({
      where: { id, status: 'CANCELLED', refundedAt: null, refundOfferedAt: { not: null } },
      data: { status: 'REQUESTED', cancelledAt: null, refundOfferedAt: null, scheduledFor: null, meetingUrl: null, respondBy: triage({ reason: row.reason }).respondBy },
    });
    if (count === 0) throw new ConflictException('This appointment has already been dealt with');
    await this.audit.log({ actorId: patientId, actorRole: UserRole.PATIENT, action: 'APPOINTMENT_RESCHEDULE_CHOSEN', resourceType: 'AppointmentRequest', resourceId: id, patientId });
    return this.toModel(await this.prisma.appointmentRequest.findUniqueOrThrow({ where: { id }, include: { handledBy: { select: { firstName: true, lastName: true } } } }));
  }

  private async find(id: string) {
    const row = await this.prisma.appointmentRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Appointment not found');
    return row;
  }

  /** A conditional update, so two people acting at once can't both move the same request on. */
  private async transition(actorId: string, actorRole: UserRole, row: AppointmentRequest, from: AppointmentStatus[], data: Record<string, unknown>, action: string) {
    const { count } = await this.prisma.appointmentRequest.updateMany({ where: { id: row.id, status: { in: from } }, data });
    if (count !== 1) throw new ConflictException(`This appointment is already ${row.status.toLowerCase()}`);
    // Answered, booked or withdrawn: it no longer waits for a doctor. Going back to waiting (a booked time was given up) is
    // the opposite: the alert is raised again by whoever reopened it.
    if (data.status !== 'REQUESTED') await this.notifier?.resolve(appointmentKey(row.id));
    await this.audit.log({ actorId, actorRole, action, resourceType: 'AppointmentRequest', resourceId: row.id, patientId: row.patientId, metadata: { status: data.status } });
    const updated = await this.prisma.appointmentRequest.findUniqueOrThrow({ where: { id: row.id }, include: { handledBy: { select: { firstName: true, lastName: true } } } });
    return this.toModel(updated);
  }

  /** Urgent requests must be answered within 24 hours: every doctor hears about it, by email too. */
  private async alertDoctors(patientId: string, requestId: string) {
    if (!this.notifier) return;
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true } });
    await this.notifier.toStaff({ roles: [ClinicianRole.ADMIN, ClinicianRole.DOCTOR] }, {
      kind: NotificationKind.URGENT_APPOINTMENT,
      params: { patient: patient ? `${patient.firstName} ${patient.lastName}` : 'A patient' },
      href: '/appointments',
      groupKey: appointmentKey(requestId),
      email: true,
    });
  }

  private async notify(patientId: string, headline: string) {
    await this.notifier?.toPatient(patientId, { kind: NotificationKind.APPOINTMENT_UPDATE, params: { headline }, href: '/appointments' });
    try {
      const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { email: true, firstName: true } });
      const portal = this.config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3000';
      await this.email.sendConsultationUpdateEmail(patient.email, patient.firstName, headline, `${portal}/appointments`);
    } catch (err) {
      // The change is saved and shows in the portal either way.
      this.logger.error(`Appointment email failed: ${(err as Error).message}`);
    }
  }

  private toModel(r: Row): AppointmentRequestModel {
    return {
      id: r.id,
      reason: r.reason,
      details: r.details,
      painLevel: r.painLevel,
      redFlags: r.redFlags,
      urgency: r.urgency,
      emergencyAdvised: r.emergencyAdvised,
      preferredTimes: r.preferredTimes,
      status: r.status,
      respondBy: r.respondBy,
      scheduledFor: r.scheduledFor,
      meetingUrl: r.meetingUrl,
      clinicianNote: r.clinicianNote,
      paymentUrl: r.status === 'AWAITING_PAYMENT' ? r.paymentUrl : null,
      paymentAmountCents: r.paymentAmountCents,
      paymentCurrency: r.paymentCurrency,
      paid: !!r.paidAt,
      refundedAt: r.refundedAt,
      canRefund: this.canRefund(r),
      refundOffered: r.status === 'CANCELLED' && !!r.refundOfferedAt && !r.refundedAt && !!r.paidAt,
      clinicianName: r.handledBy ? `Dr. ${r.handledBy.firstName} ${r.handledBy.lastName}` : null,
      createdAt: r.createdAt,
      bookingPurpose: this.purposeOf(r),
    };
  }
}
