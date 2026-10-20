import { BadRequestException, Injectable } from '@nestjs/common';
import { Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationKind } from '@telehealth/shared-types';
import { NotifierService } from '../notifications/notifier.service';
import { ClinicianRole } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OrderStatus, PrescriptionStatus, UserRole } from '../common/enums';
import { refillStateOf } from './shipment-alerts';
import { ShipmentsService } from './shipments.service';
import { SupplyStatusModel } from './models/supply-status.model';

/**
 * The patient's side of the next supply: where it stands, and a one-tap request for it. A request only
 * tells the doctor the patient is ready — the order itself is still placed by a prescriber, so the
 * monthly check-in review and the prescribing rules are never skipped. Billing stays with the Stripe
 * subscription, which renews on its own; nothing here charges anyone.
 */
@Injectable()
export class RefillService {
  constructor(
    private prisma: PrismaService,
    private shipments: ShipmentsService,
    private audit: AuditService,
    @Optional() private notifier?: NotifierService,
  ) {}

  async status(patientId: string): Promise<SupplyStatusModel> {
    const [patient, alert, pending] = await Promise.all([
      this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { activatedAt: true, subscriptionEndedAt: true } }),
      this.shipments.forPatient(patientId),
      this.prisma.order.count({ where: { patientId, status: OrderStatus.PENDING, prescription: { status: PrescriptionStatus.ACTIVE } } }),
    ]);
    const lead = this.shipments.leadDays;
    const refillState = refillStateOf(alert, lead);
    return {
      subscriptionActive: !!patient.activatedAt && !patient.subscriptionEndedAt,
      medication: alert?.medication,
      nextSupplyAt: alert?.nextDueAt,
      daysUntilNextSupply: alert?.daysUntilDue,
      repeatsLeft: alert?.repeatsLeft,
      supplyBeingPrepared: pending > 0,
      refillState,
      refillOpensInDays: refillState === 'NOT_YET' && alert ? alert.daysUntilDue - lead : undefined,
      refillRequestedAt: alert?.refillRequestedAt ?? undefined,
    } as SupplyStatusModel;
  }

  /**
   * A patient whose subscription ended, and whose account is still open, wants to carry on. They come back paying for each
   * supply on its own (no card is kept), the monthly "we miss you" emails stop, and the doctors are told: the old prescription
   * has run out, so they need a check-in and a new prescription (with its fee) before anything is sent.
   */
  async restart(patientId: string): Promise<SupplyStatusModel> {
    const { count } = await this.prisma.patient.updateMany({
      where: { id: patientId, activatedAt: { not: null }, accessClosedAt: null, subscriptionEndedAt: { not: null } },
      data: { subscriptionEndedAt: null, paysPerSupply: true, lapsedEmailsSent: 0, lapsedEmailAt: null },
    });
    if (count === 0) return this.status(patientId); // already running (a second tap), or nothing to restart
    await this.audit.log({ actorId: patientId, actorRole: UserRole.PATIENT, action: 'TREATMENT_RESTARTED', resourceType: 'Patient', resourceId: patientId, patientId });
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true } });
    await this.notifier?.toStaff({ roles: [ClinicianRole.ADMIN, ClinicianRole.DOCTOR] }, {
      kind: NotificationKind.TREATMENT_RESTART_REQUESTED,
      params: { patient: patient ? `${patient.firstName} ${patient.lastName}` : 'A patient' },
      href: `/patients?patient=${patientId}`,
      groupKey: `restart:${patientId}`,
    }).catch(() => undefined);
    return this.status(patientId);
  }

  /** Asks for the next supply. Asking twice is harmless: the second call returns the same request. */
  async request(patientId: string): Promise<SupplyStatusModel> {
    const alert = await this.shipments.forPatient(patientId);
    const state = refillStateOf(alert, this.shipments.leadDays);
    if (state === 'REQUESTED') return this.status(patientId);
    if (state !== 'READY' || !alert) throw new BadRequestException(REFUSAL[state]);

    // The supply being asked for is the next order number, so a retry or a double tap hits the unique key instead of adding a second request.
    const last = await this.prisma.order.aggregate({ where: { prescriptionId: alert.prescriptionId }, _max: { sequence: true } });
    const sequence = (last._max.sequence ?? 0) + 1;
    try {
      await this.prisma.refillRequest.create({ data: { patientId, prescriptionId: alert.prescriptionId, sequence } });
      await this.audit.log({
        actorId: patientId,
        actorRole: UserRole.PATIENT,
        action: 'REFILL_REQUESTED',
        resourceType: 'Prescription',
        resourceId: alert.prescriptionId,
        patientId,
        metadata: { sequence },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
    this.shipments.invalidate(); // the doctors' list and the bell should show it straight away
    return this.status(patientId);
  }
}

const REFUSAL: Record<string, string> = {
  UNAVAILABLE: 'There is nothing to refill right now.',
  NOT_YET: 'It is too early to ask for your next supply.',
  CHECK_IN_FIRST: 'Please complete your check-in first, so your doctor can approve your next supply.',
  IN_REVIEW: 'Your doctor is already reviewing your check-in — your next supply follows from that.',
  NO_REPEATS: 'Your prescription has no repeats left. Your doctor will arrange a new one at your check-in.',
};
