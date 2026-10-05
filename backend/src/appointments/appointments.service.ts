import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentRequest, AppointmentStatus, Booking, Clinician } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { BookingService } from '../booking/booking.service';
import { UserRole } from '../common/enums';
import { AppointmentAlertModel, AppointmentRequestModel, RequestAppointmentInput, ScheduleAppointmentInput } from './models/appointment.model';
import { EMERGENCY_ADVICE, MAX_DETAILS_LENGTH, MAX_OPEN_REQUESTS, RED_FLAGS, byPriority, triage } from './triage';

const OPEN: AppointmentStatus[] = ['REQUESTED', 'SCHEDULED'];

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
@Injectable()
export class AppointmentsService implements OnModuleInit {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private email: EmailService,
    private config: ConfigService,
    private bookings: BookingService,
  ) {}

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

    const open = await this.prisma.appointmentRequest.count({ where: { patientId, status: 'REQUESTED' } });
    if (open >= MAX_OPEN_REQUESTS) throw new BadRequestException('You already have requests waiting — your doctor will be in touch. Message them if anything changes.');

    const t = triage({ reason: input.reason, urgent: input.urgent, painLevel: input.painLevel, redFlags });
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
          preferredTimes: input.preferredTimes?.trim().slice(0, 300) || null,
        },
      });
      await this.audit.log(
        { actorId: patientId, actorRole: UserRole.PATIENT, action: 'APPOINTMENT_REQUESTED', resourceType: 'AppointmentRequest', resourceId: created.id, patientId, metadata: { urgency: t.urgency, redFlags } },
        tx,
      );
      return created;
    });
    return { ...this.toModel(row), advice: t.emergencyAdvised ? EMERGENCY_ADVICE : null };
  }

  async mine(patientId: string): Promise<AppointmentRequestModel[]> {
    const rows = await this.prisma.appointmentRequest.findMany({
      where: { patientId },
      include: { handledBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((r) => this.toModel(r));
  }

  async cancelMine(patientId: string, id: string) {
    const row = await this.prisma.appointmentRequest.findUnique({ where: { id } });
    if (!row || row.patientId !== patientId) throw new NotFoundException('Appointment not found');
    await this.bookings.cancelFor(PURPOSES, row.id, { actorId: patientId, actorRole: UserRole.PATIENT }, 'Cancelled by the patient', patientId);
    return this.transition(patientId, UserRole.PATIENT, row, OPEN, { status: 'CANCELLED', cancelledAt: new Date() }, 'APPOINTMENT_CANCELLED');
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
    await this.bookings.cancelFor(PURPOSES, row.id, { actorId: clinicianId, actorRole: UserRole.CLINICIAN }, note.trim(), row.patientId);
    const updated = await this.transition(clinicianId, UserRole.CLINICIAN, row, OPEN, {
      status: 'CANCELLED', cancelledAt: new Date(), clinicianNote: note.trim(), handledById: clinicianId,
    }, 'APPOINTMENT_CANCELLED');
    await this.notify(row.patientId, 'An update on your appointment');
    return updated;
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
    await this.audit.log({ actorId, actorRole, action, resourceType: 'AppointmentRequest', resourceId: row.id, patientId: row.patientId, metadata: { status: data.status } });
    const updated = await this.prisma.appointmentRequest.findUniqueOrThrow({ where: { id: row.id }, include: { handledBy: { select: { firstName: true, lastName: true } } } });
    return this.toModel(updated);
  }

  private async notify(patientId: string, headline: string) {
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
      clinicianName: r.handledBy ? `Dr. ${r.handledBy.firstName} ${r.handledBy.lastName}` : null,
      createdAt: r.createdAt,
      bookingPurpose: this.purposeOf(r),
    };
  }
}
