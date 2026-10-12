import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
