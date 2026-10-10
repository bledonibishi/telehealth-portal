import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationKind } from '@telehealth/shared-types';
import { ClinicianRole, UserRole } from '../common/enums';
import { NotifierService } from '../notifications/notifier.service';
import { BillingService } from './billing.service';

const refundKey = (id: string) => `refund:${id}`;

const BILLING_PATIENT = { id: true, email: true, firstName: true, stripeCustomerId: true, stripeSubscriptionId: true } as const;

/**
 * The patient asks, an admin decides. Asking costs the patient nothing and needs no reason; the money only moves when
 * an admin approves, having seen whether the medicine has already left the pharmacy.
 */
@Injectable()
export class RefundRequestsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private billing: BillingService,
    private notifier?: NotifierService,
  ) {}

  /** The patient's open request, if any. */
  open(patientId: string) {
    return this.prisma.refundRequest.findFirst({ where: { patientId, status: 'REQUESTED' } });
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

  async decide(adminId: string, id: string, approve: boolean, endSubscription: boolean) {
    const request = await this.prisma.refundRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Refund request not found');
    if (request.status !== 'REQUESTED') throw new BadRequestException('This request has already been decided');

    // Claim it first, so two admins pressing at once cannot refund twice.
    const claimed = await this.prisma.refundRequest.updateMany({
      where: { id, status: 'REQUESTED' },
      data: { status: approve ? 'APPROVED' : 'DECLINED', decidedAt: new Date(), decidedById: adminId },
    });
    if (claimed.count === 0) throw new BadRequestException('This request has already been decided');

    let outcome = 'Declined';
    if (approve) {
      try {
        const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: request.patientId }, select: BILLING_PATIENT });
        const refunded = await this.billing.refundLatestPaymentResult(patient);
        // Nothing was refunded (Stripe said no, no subscription, nothing paid, already refunded): not an approval.
        if (!refunded.ok) throw new BadRequestException(`Nothing was refunded: ${refunded.note}. The request is still open; decline it if it should not be refunded.`);
        outcome = refunded.note;
        if (endSubscription) {
          const stopped = await this.billing.cancelAtPeriodEndResult(patient);
          outcome += stopped.ok ? `. ${stopped.note}` : `. The subscription was NOT stopped (${stopped.note}); stop it in Stripe`;
        }
      } catch (err) {
        // Stripe said no: put the request back so it can be tried again, instead of leaving it "approved" with no refund.
        await this.prisma.refundRequest.update({ where: { id }, data: { status: 'REQUESTED', decidedAt: null, decidedById: null } });
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
