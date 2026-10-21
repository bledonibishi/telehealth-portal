import { ReferralsService } from '../referrals/referrals.service';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationKind } from '@telehealth/shared-types';
import { ClinicianRole, OrderStatus, UserRole } from '../common/enums';
import { NotifierService } from '../notifications/notifier.service';
import { ModuleRef } from '@nestjs/core';
import { BillingService } from './billing.service';
import { OrdersService } from '../prescriptions/orders.service';
import { EmailService } from '../email/email.service';

/** Shipped supplies still with the courier: the only ones that can still come back. */
const WITH_COURIER: OrderStatus[] = [OrderStatus.DISPATCHED, OrderStatus.OUT_FOR_DELIVERY];

const refundKey = (id: string) => `refund:${id}`;


const BILLING_PATIENT = { id: true, email: true, firstName: true, stripeCustomerId: true, stripeSubscriptionId: true } as const;

/**
 * The patient asks, an admin decides. Asking costs the patient nothing and needs no reason; the money only moves when
 * an admin approves, having seen whether the medicine has already left the pharmacy.
 */
@Injectable()
export class RefundRequestsService {
  private readonly logger = new Logger(RefundRequestsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private billing: BillingService,
    private notifier?: NotifierService,
    // Looked up when needed: the orders module already imports this one.
    private moduleRef?: ModuleRef,
    private email?: EmailService,
  ) {}

  /** The patient's open request, if any. */
  open(patientId: string) {
    return this.prisma.refundRequest.findFirst({ where: { patientId, status: { in: ['REQUESTED', 'AWAITING_RETURN'] } } });
  }

  /**
   * A patient refunded before any supply reached them leaves: sign-in is closed and their open sessions end. Their records are
   * kept. If the doctor's prescription is still good, they are offered it again for the medicine only; otherwise they are
   * told their account is closed. Someone who has had a supply keeps their access. Returns a line for the record.
   */
  private async closeAccessIfFirstOrder(patientId: string, patient: { email: string; firstName?: string | null }, orders: OrdersService | undefined): Promise<string> {
    // The refund has been made by now: nothing here may undo it. A step that fails is said in the outcome, for an admin to finish.
    try {
      return await this.closeAccess(patientId, patient, orders);
    } catch (err: any) {
      this.logger.error(`Closing access for ${patientId} after a refund failed: ${err?.message}`);
      return '. The account could NOT be closed and the waiting consultation was not closed (' + (err?.message ?? 'unknown error') + '); do both by hand';
    }
  }

  private async closeAccess(patientId: string, patient: { email: string; firstName?: string | null }, orders: OrdersService | undefined): Promise<string> {
    const received = await this.prisma.order.count({ where: { patientId, deliveredAt: { not: null } } });
    if (received > 0) return '';
    await this.prisma.patient.update({ where: { id: patientId }, data: { accessClosedAt: new Date(), accessClosedReason: 'REFUNDED_FIRST_ORDER', tokenVersion: { increment: 1 } } });
    await this.audit.log({ actorId: 'system:refund', actorRole: UserRole.ADMIN, action: 'ACCESS_CLOSED', resourceType: 'Patient', resourceId: patientId, patientId, metadata: { reason: 'REFUNDED_FIRST_ORDER' } });
    // They can't sign in to apply a voucher by hand, and they are about to be asked for money: it comes off this payment.
    await this.moduleRef?.get(ReferralsService, { strict: false }).applyAllFor(patientId).catch((err: any) => this.logger.error(`Applying vouchers for ${patientId} failed: ${err?.message}`));
    // Whatever was waiting for a doctor is closed: they were refunded, so nobody should review it. A new quiz brings a new one.
    await this.prisma.consultation.updateMany({
      where: { patientId, status: { in: ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'] } },
      data: { status: 'DECLINED', declineReason: 'The patient asked for a refund before it was reviewed', refundStatus: 'REFUNDED' },
    });
    const offer = await orders?.offerReturn(patientId).catch((err: any) => {
      this.logger.error(`Offering ${patientId} their prescription again failed: ${err?.message}`);
      return null;
    });
    if (!offer) await this.email?.sendAccountClosedEmail(patient.email, patient.firstName ?? '').catch(() => undefined);
    return offer ? `. Access closed (no supply was received); they were offered the prescription again until ${offer.until.toLocaleDateString('en-GB')}` : '. Access closed (no supply was received)';
  }

  /** The patient's most recent request that has been answered, so they can see what became of it. */
  latestDecided(patientId: string) {
    return this.prisma.refundRequest.findFirst({ where: { patientId, status: { in: ['APPROVED', 'DECLINED'] } }, orderBy: { decidedAt: 'desc' } });
  }

  /** A second tap returns the request already open instead of making another. */
  async request(patientId: string) {
    const existing = await this.open(patientId);
    if (existing) return existing;
    let created;
    try {
      created = await this.prisma.refundRequest.create({ data: { patientId } });
    } catch (err) {
      // Two taps at once: the database allows only one open request per patient, so the other tap lands here.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const open = await this.open(patientId);
        if (open) return open;
      }
      throw err;
    }
    await this.audit.log({ actorId: patientId, actorRole: UserRole.PATIENT, action: 'REFUND_REQUESTED', resourceType: 'RefundRequest', resourceId: created.id, patientId });
    if (this.notifier) await this.tellAdmins(patientId, created.id).catch(() => undefined);
    return created;
  }

  private async tellAdmins(patientId: string, requestId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true } });
    await this.notifier?.toStaff({ roles: [ClinicianRole.ADMIN] }, {
      kind: NotificationKind.REFUND_REQUESTED,
      params: { patient: patient ? `${patient.firstName} ${patient.lastName}` : 'A patient' },
      href: '/orders',
      groupKey: refundKey(requestId),
    });
  }

  /** Stops the next payment; what has been paid stays paid. */
  async cancelSubscription(patientId: string): Promise<string> {
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: BILLING_PATIENT });
    const result = await this.billing.cancelAtPeriodEndResult(patient);
    // A failure is told as one: the patient must never believe the charges have stopped when they have not.
    if (!result.ok) throw new BadRequestException('We couldn’t stop your subscription just now. Please try again, or message us and we’ll do it for you.');
    const note = result.note;
    await this.audit.log({ actorId: patientId, actorRole: UserRole.PATIENT, action: 'SUBSCRIPTION_CANCEL_REQUESTED', resourceType: 'Patient', resourceId: patientId, patientId });
    return note;
  }

  /** Open requests, oldest first, with what an admin needs to decide: who, and where the latest order is. */
  async listOpen() {
    const requests = await this.prisma.refundRequest.findMany({
      where: { status: 'REQUESTED' },
      orderBy: { requestedAt: 'asc' },
      include: { patient: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return Promise.all(
      requests.map(async (r) => {
        const latest = await this.prisma.order.findFirst({ where: { patientId: r.patientId, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, select: { status: true, sequence: true } });
        return { ...r, latestOrderStatus: latest?.status ?? null, latestOrderSequence: latest?.sequence ?? null };
      }),
    );
  }

  /** Refund requests whose parcel is still on its way back, with where that parcel is. */
  async listAwaitingReturn() {
    const requests = await this.prisma.refundRequest.findMany({
      where: { status: 'AWAITING_RETURN' },
      orderBy: { requestedAt: 'asc' },
      include: { patient: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return Promise.all(
      requests.map(async (r) => {
        const order = r.awaitingOrderId
          ? await this.prisma.order.findUnique({ where: { id: r.awaitingOrderId }, select: { status: true, sequence: true, carrier: true, trackingNumber: true, trackingUrl: true, trackingEvents: { orderBy: { occurredAt: 'desc' }, take: 1, select: { status: true } } } })
          : null;
        return { ...r, order };
      }),
    );
  }

  /**
   * The parcel is with the courier, so the refund waits for it to come back instead of paying twice. The patient is told not
   * to open it. When the courier reports it returned, the refund is made on its own (see onParcelReturned); if it is delivered
   * instead, the admin is asked to decide again.
   */
  async waitForReturn(adminId: string, id: string, endSubscription: boolean) {
    const request = await this.prisma.refundRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Refund request not found');
    if (request.status !== 'REQUESTED') throw new BadRequestException('This request has already been decided');
    const parcel = await this.prisma.order.findFirst({ where: { patientId: request.patientId, status: { in: WITH_COURIER } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (!parcel) throw new BadRequestException('No parcel is with the courier for this patient, so there is nothing to wait for. Refund now or decline.');

    const claimed = await this.prisma.refundRequest.updateMany({
      where: { id, status: 'REQUESTED' },
      data: { status: 'AWAITING_RETURN', awaitingOrderId: parcel.id, awaitingEndSubscription: endSubscription, decidedById: adminId },
    });
    if (claimed.count === 0) throw new BadRequestException('This request has already been decided');

    await this.audit.log({ actorId: adminId, actorRole: UserRole.CLINICIAN, action: 'REFUND_AWAITING_RETURN', resourceType: 'RefundRequest', resourceId: id, patientId: request.patientId, metadata: { orderId: parcel.id } });
    await this.notifier?.resolve(refundKey(id));
    const patient = await this.prisma.patient.findUnique({ where: { id: request.patientId }, select: { email: true, firstName: true } });
    void this.notifier?.toPatient(request.patientId, { kind: NotificationKind.REFUND_AWAITING_RETURN, href: '/settings' });
    if (patient) await this.email?.sendRefundAwaitingReturnEmail(patient.email, patient.firstName).catch(() => undefined);
    return this.prisma.refundRequest.findUniqueOrThrow({ where: { id } });
  }

  /** The courier reports the parcel back: the refund that was waiting for it is made now. Never throws (a courier event must not fail on it). */
  async onParcelReturned(orderId: string): Promise<void> {
    try {
      const waiting = await this.prisma.refundRequest.findMany({ where: { status: 'AWAITING_RETURN', awaitingOrderId: orderId } });
      for (const r of waiting) await this.decide(r.decidedById ?? 'system:courier', r.id, true, r.awaitingEndSubscription);
    } catch (err: any) {
      // Left waiting, and the admin is told: money is never moved on a guess.
      this.logger.error(`Refunding after the parcel ${orderId} was returned failed: ${err?.message}`);
      await this.askAdminsAgain(orderId, `The parcel was returned but the refund could not be made (${err?.message})`);
    }
  }

  /** The parcel was delivered after all: the medicine can't come back, so an admin decides afresh. Never throws. */
  async onParcelDelivered(orderId: string): Promise<void> {
    try {
      await this.askAdminsAgain(orderId, 'The parcel was delivered');
    } catch (err: any) {
      this.logger.error(`Reopening the refund for parcel ${orderId} failed: ${err?.message}`);
    }
  }

  private async askAdminsAgain(orderId: string, why: string) {
    const waiting = await this.prisma.refundRequest.findMany({ where: { status: 'AWAITING_RETURN', awaitingOrderId: orderId } });
    for (const r of waiting) {
      const back = await this.prisma.refundRequest.updateMany({ where: { id: r.id, status: 'AWAITING_RETURN' }, data: { status: 'REQUESTED', awaitingOrderId: null, outcome: why } });
      if (back.count === 1) await this.tellAdmins(r.patientId, r.id).catch(() => undefined);
    }
  }

  async decide(adminId: string, id: string, approve: boolean, endSubscription: boolean) {
    const request = await this.prisma.refundRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Refund request not found');
    // A request that is waiting for its parcel can still be decided: refund anyway, or decline.
    const was = request.status;
    if (was !== 'REQUESTED' && was !== 'AWAITING_RETURN') throw new BadRequestException('This request has already been decided');

    // Claim it first, so two admins pressing at once cannot refund twice.
    const claimed = await this.prisma.refundRequest.updateMany({
      where: { id, status: was },
      data: { status: approve ? 'APPROVED' : 'DECLINED', decidedAt: new Date(), decidedById: adminId },
    });
    if (claimed.count === 0) throw new BadRequestException('This request has already been decided');

    let outcome = 'Declined';
    if (approve) {
      try {
        const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: request.patientId }, select: BILLING_PATIENT });
        // The prescription fee stays with the clinic once a prescription was written; before that, everything goes back.
        const written = await this.prisma.prescription.findFirst({ where: { patientId: request.patientId }, orderBy: { issuedAt: 'desc' }, select: { issuedAt: true } });
        const refunded = await this.billing.refundLatestPaymentResult(patient, { prescriptionIssuedAt: written?.issuedAt ?? null });
        // Nothing was refunded (Stripe said no, no subscription, nothing paid, already refunded): not an approval.
        if (!refunded.ok) throw new BadRequestException(`Nothing was refunded: ${refunded.note}. The request is still open; decline it if it should not be refunded.`);
        outcome = refunded.note;
        if (endSubscription) {
          // Refunded, so nothing more is taken and nothing more is sent: the subscription ends now, not at the end of the period.
          const stopped = await this.billing.cancelNowResult(patient);
          outcome += stopped.ok ? `. ${stopped.note}` : `. The subscription was NOT stopped (${stopped.note}); stop it in Stripe`;
          if (stopped.ok) {
            await this.prisma.patient.updateMany({ where: { id: request.patientId, subscriptionEndedAt: null }, data: { subscriptionEndedAt: new Date() } });
            const orderService = this.moduleRef?.get(OrdersService, { strict: false });
            const orders = await orderService?.cancelUnshippedFor(request.patientId, 'Refunded at the patient’s request').catch(() => 0);
            if (orders) outcome += `. ${orders} order${orders === 1 ? '' : 's'} not yet shipped cancelled`;
            outcome += await this.closeAccessIfFirstOrder(request.patientId, patient, orderService);
          }
        }
      } catch (err) {
        // Stripe said no: put the request back so it can be tried again, instead of leaving it "approved" with no refund.
        await this.prisma.refundRequest.update({ where: { id }, data: { status: was, decidedAt: null, decidedById: null } });
        throw err;
      }
    }
    const decided = await this.prisma.refundRequest.update({ where: { id }, data: { outcome } });
    await this.audit.log({ actorId: adminId, actorRole: UserRole.CLINICIAN, action: approve ? 'REFUND_APPROVED' : 'REFUND_DECLINED', resourceType: 'RefundRequest', resourceId: id, patientId: request.patientId });
    await this.notifier?.resolve(refundKey(id));
    void this.notifier?.toPatient(request.patientId, { kind: approve ? NotificationKind.REFUND_APPROVED : NotificationKind.REFUND_DECLINED, href: '/settings' });
    return decided;
  }
}
