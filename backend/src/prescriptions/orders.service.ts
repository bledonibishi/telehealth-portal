import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OrderStatus, PrescriptionStatus, UserRole } from '../common/enums';

type Db = PrismaService | Prisma.TransactionClient;

export const ORDER_INCLUDE = {
  patient: true,
  prescription: { include: { consultation: true } },
} satisfies Prisma.OrderInclude;

export interface DeliveryAddress {
  name: string;
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  country: string;
}

export function deliveryAddressOf(patient: {
  firstName: string; lastName: string; phone: string | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null; postcode: string | null; country: string | null;
}): DeliveryAddress | null {
  if (!patient.addressLine1 || !patient.city || !patient.postcode || !patient.country) return null;
  return {
    name: `${patient.firstName} ${patient.lastName}`,
    phone: patient.phone,
    addressLine1: patient.addressLine1,
    addressLine2: patient.addressLine2,
    city: patient.city,
    postcode: patient.postcode,
    country: patient.country,
  };
}

// Fulfilment of prescriptions: each order is one supply (first fill or a
// repeat). Every transition is a conditional update on the current status, so
// two people clicking at once can't skip or repeat a step.
@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
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

  /** The first supply, created alongside the prescription. */
  createInitial(prescription: { id: string; patientId: string }, db: Db) {
    return db.order.create({ data: { prescriptionId: prescription.id, patientId: prescription.patientId, sequence: 1 } });
  }

  /** Another supply against a prescription's repeats. */
  async createRepeat(actorId: string, prescriptionId: string, db: Db = this.prisma) {
    const rx = await db.prescription.findUnique({ where: { id: prescriptionId }, include: { orders: true } });
    if (!rx) throw new NotFoundException('Prescription not found');
    this.assertDispensable(rx);

    const live = rx.orders.filter((o) => o.status !== OrderStatus.CANCELLED);
    if (live.some((o) => o.status === OrderStatus.PENDING)) {
      throw new ConflictException('There is already an order waiting to be dispatched for this prescription');
    }
    const repeatsUsed = Math.max(live.length - 1, 0);
    if (repeatsUsed >= rx.refillsAllowed) {
      throw new BadRequestException('All repeats on this prescription have been used — it needs a new prescription');
    }

    const sequence = Math.max(0, ...rx.orders.map((o) => o.sequence)) + 1;
    const order = await db.order.create({ data: { prescriptionId, patientId: rx.patientId, sequence } });
    await this.log(actorId, 'ORDER_CREATED', order.id, { prescriptionId, sequence });
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
    await this.log(actorId, 'ORDER_DISPATCHED', id, { pharmacyRef: pharmacyRef.trim() });
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
    await this.log(actorId, 'ORDER_OUT_FOR_DELIVERY', id, { carrier, trackingNumber });
    return this.find(id);
  }

  async markDelivered(actorId: string, id: string) {
    await this.transition(id, OrderStatus.OUT_FOR_DELIVERY, { status: OrderStatus.DELIVERED, deliveredAt: new Date() });
    await this.log(actorId, 'ORDER_DELIVERED', id);
    return this.find(id);
  }

  async cancel(actorId: string, id: string, reason: string) {
    if (!reason.trim()) throw new BadRequestException('A reason is required to cancel an order');
    await this.transition(id, OrderStatus.PENDING, {
      status: OrderStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: reason.trim(),
    });
    await this.log(actorId, 'ORDER_CANCELLED', id, { reason: reason.trim() });
    return this.find(id);
  }

  /** Stops anything not yet dispatched when its prescription is cancelled. */
  cancelPendingFor(prescriptionId: string, reason: string, db: Db = this.prisma) {
    return db.order.updateMany({
      where: { prescriptionId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
    });
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

  private async find(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private log(actorId: string, action: string, orderId: string, metadata?: Record<string, unknown>) {
    return this.audit.log({ actorId, actorRole: UserRole.CLINICIAN, action, resourceType: 'Order', resourceId: orderId, metadata });
  }
}
