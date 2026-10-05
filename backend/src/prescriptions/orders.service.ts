import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TrtMonitoringService } from '../labs/trt-monitoring.service';
import { PartnerOrdersService } from './partner-orders.service';
import { deliveryAddressOf } from './delivery-address';
import { OrderStatus, PrescriptionStatus, UserRole } from '../common/enums';

type Db = PrismaService | Prisma.TransactionClient;

/** Delivery state for staff — never the stored payload (it holds the patient's address and is fetched on demand). */
const PARTNER_STATUS_SELECT = {
  select: { status: true, event: true, channels: true, attempts: true, lastError: true, lastAttemptAt: true, sentAt: true },
} as const;

export const ORDER_INCLUDE = {
  patient: true,
  prescription: { include: { consultation: true } },
  partnerTransmission: PARTNER_STATUS_SELECT,
} satisfies Prisma.OrderInclude;

/** What a patient may see of their own orders: no pharmacy-partner delivery details (they can carry internal errors). */
export const PATIENT_ORDER_INCLUDE = {
  patient: true,
  prescription: { include: { consultation: true } },
} satisfies Prisma.OrderInclude;

export { deliveryAddressOf, type DeliveryAddress } from './delivery-address';

// Fulfilment of prescriptions: each order is one supply (first fill or a
// repeat). Every transition is a conditional update on the current status, so
// two people clicking at once can't skip or repeat a step.
@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private trtMonitoring: TrtMonitoringService,
    private partner: PartnerOrdersService,
  ) {}

  findAll(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : undefined,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findByPatient(patientId: string) {
    return this.prisma.order.findMany({ where: { patientId }, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  /** A patient's own orders, without staff-only fulfilment details. */
  findOwn(patientId: string) {
    return this.prisma.order.findMany({ where: { patientId }, include: PATIENT_ORDER_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  /** The first supply, created alongside the prescription. */
  createInitial(prescription: { id: string; patientId: string }, db: Db) {
    return db.order.create({ data: { prescriptionId: prescription.id, patientId: prescription.patientId, sequence: 1 } });
  }

  /** Another supply against a prescription's repeats. */
  async createRepeat(actorId: string, prescriptionId: string, db: Db = this.prisma) {
    const rx = await db.prescription.findUnique({
      where: { id: prescriptionId },
      include: { orders: true, patient: { select: { subscriptionEndedAt: true } } },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    this.assertDispensable(rx);
    if (rx.patient?.subscriptionEndedAt) {
      throw new BadRequestException('The patient’s subscription has ended — no further supplies can be ordered');
    }

    const live = rx.orders.filter((o) => o.status !== OrderStatus.CANCELLED);
    if (live.some((o) => o.status === OrderStatus.PENDING)) {
      throw new ConflictException('There is already an order waiting to be dispatched for this prescription');
    }
    const repeatsUsed = Math.max(live.length - 1, 0);
    if (repeatsUsed >= rx.refillsAllowed) {
      throw new BadRequestException('All repeats on this prescription have been used — it needs a new prescription');
    }
    await this.trtMonitoring.assertRepeatAllowed(prescriptionId, db);

    const sequence = Math.max(0, ...rx.orders.map((o) => o.sequence)) + 1;
    const order = await db.order.create({ data: { prescriptionId, patientId: rx.patientId, sequence } });
    // Whatever the patient asked for is now answered, whether the doctor placed this from the shipments list or after a check-in.
    await db.refillRequest.updateMany({ where: { prescriptionId, resolvedAt: null }, data: { resolvedAt: new Date(), orderId: order.id } });
    await this.log(actorId, 'ORDER_CREATED', order.id, rx.patientId, { prescriptionId, sequence }, db);
    // Hand it to the pharmacy partner straight away (when a channel is set up); a failure is retried later.
    if (db === this.prisma) await this.partner.trySend(order.id);
    return db.order.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
  }

  async dispatch(actorId: string, id: string, pharmacyRef: string) {
    if (!pharmacyRef.trim()) throw new BadRequestException('A pharmacy reference is required');
    const order = await this.find(id);
    this.assertDispensable(order.prescription);

    const address = deliveryAddressOf(order.patient);
    if (!address) throw new BadRequestException('The patient has no complete delivery address on file');

    await this.transition(id, OrderStatus.PENDING, {
      status: OrderStatus.DISPATCHED,
      dispatchedAt: new Date(),
      pharmacyRef: pharmacyRef.trim(),
      shippingAddress: address as unknown as Prisma.InputJsonValue,
    });
    await this.log(actorId, 'ORDER_DISPATCHED', id, order.patientId, { pharmacyRef: pharmacyRef.trim() });
    return this.find(id);
  }

  async markOutForDelivery(actorId: string, id: string, carrier?: string, trackingNumber?: string, trackingUrl?: string) {
    await this.transition(id, OrderStatus.DISPATCHED, {
      status: OrderStatus.OUT_FOR_DELIVERY,
      outForDeliveryAt: new Date(),
      carrier,
      trackingNumber,
      trackingUrl,
    });
    const order = await this.find(id);
    await this.log(actorId, 'ORDER_OUT_FOR_DELIVERY', id, order.patientId, { carrier, trackingNumber });
    return order;
  }

  async markDelivered(actorId: string, id: string) {
    await this.transition(id, OrderStatus.OUT_FOR_DELIVERY, { status: OrderStatus.DELIVERED, deliveredAt: new Date() });
    const order = await this.find(id);
    await this.log(actorId, 'ORDER_DELIVERED', id, order.patientId);
    return order;
  }

  async cancel(actorId: string, id: string, reason: string) {
    if (!reason.trim()) throw new BadRequestException('A reason is required to cancel an order');
    await this.transition(id, OrderStatus.PENDING, {
      status: OrderStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: reason.trim(),
    });
    const order = await this.find(id);
    await this.log(actorId, 'ORDER_CANCELLED', id, order.patientId, { reason: reason.trim() });
    // If the pharmacy partner was already given this order, tell it not to dispatch.
    await this.partner.markCancelled([id]);
    await this.partner.flushCancellations();
    return order;
  }

  /**
   * Stops anything not yet dispatched when its prescription is cancelled. Orders the pharmacy
   * partner already has are queued for a cancellation message in the same transaction; the caller
   * should call `partner.flushCancellations()` once it has committed (the scheduled sweep is the net).
   */
  async cancelPendingFor(prescriptionId: string, reason: string, db: Db = this.prisma) {
    const pending = await db.order.findMany({ where: { prescriptionId, status: OrderStatus.PENDING }, select: { id: true } });
    const result = await db.order.updateMany({
      where: { id: { in: pending.map((o) => o.id) }, status: OrderStatus.PENDING },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
    });
    await this.partner.markCancelled(pending.map((o) => o.id), db);
    if (db === this.prisma) await this.partner.flushCancellations();
    return result;
  }

  private assertDispensable(rx: { status: string; validUntil: Date | null }) {
    if (rx.status !== PrescriptionStatus.ACTIVE) {
      throw new BadRequestException(`The prescription is ${rx.status.toLowerCase()} and can’t be dispensed`);
    }
    if (rx.validUntil && rx.validUntil < new Date()) {
      throw new BadRequestException('The prescription has expired and can’t be dispensed');
    }
  }

  private async transition(id: string, from: OrderStatus, data: Prisma.OrderUpdateManyMutationInput) {
    const { count } = await this.prisma.order.updateMany({ where: { id, status: from }, data });
    if (count === 1) return;
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    throw new ConflictException(`The order is ${order.status.toLowerCase().replace(/_/g, ' ')}, not ${from.toLowerCase().replace(/_/g, ' ')}`);
  }

  findOne(id: string) {
    return this.find(id);
  }

  private async find(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private log(actorId: string, action: string, orderId: string, patientId: string, metadata?: Record<string, unknown>, db?: Db) {
    const entry = { actorId, actorRole: UserRole.CLINICIAN, action, resourceType: 'Order', resourceId: orderId, patientId, metadata };
    return db && db !== this.prisma ? this.audit.log(entry, db as Prisma.TransactionClient) : this.audit.log(entry);
  }
}
