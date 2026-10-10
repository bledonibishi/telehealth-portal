import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { BillingService } from '../stripe/billing.service';
import { describeEstimate } from './delivery-estimate';
import type { TrackingEventInput } from '../couriers/courier-adapter';
import { orderStatusFor, rankOf, type TrackingStatus } from '../couriers/tracking-status';
import { NotificationKind } from '@telehealth/shared-types';
import { NotifierService } from '../notifications/notifier.service';
import type { StatementOrder } from './pharmacy-statement';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TrtMonitoringService } from '../labs/trt-monitoring.service';
import { PartnerOrdersService } from './partner-orders.service';
import { deliveryAddressOf } from './delivery-address';
import { ClinicianRole, OrderStatus, PrescriptionStatus, UserRole } from '../common/enums';

type Db = PrismaService | Prisma.TransactionClient;

/** What the pharmacy tells us when it ships an order: who is carrying it and when it should arrive. */
export interface ShippingDetails {
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  estimatedDeliveryFrom?: Date | null;
  estimatedDeliveryTo?: Date | null;
}

/** How long a finished order stays in the default list; older ones are found by searching. */
const RECENT_DAYS = 60;

/** What a locked screen shows. Always general: no medicine, no name, no address. The app has the details. */
const NOTICE: Record<'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED', NotificationKind> = {
  SHIPPED: NotificationKind.ORDER_SHIPPED,
  OUT_FOR_DELIVERY: NotificationKind.ORDER_OUT_FOR_DELIVERY,
  DELIVERED: NotificationKind.ORDER_DELIVERED,
  DELIVERY_FAILED: NotificationKind.ORDER_DELIVERY_FAILED,
};

const clip = (v: string | null | undefined, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Cleans what the pharmacy typed. The tracking link goes to patients, so only web links are kept. */
function cleanShipping(input: ShippingDetails): Required<ShippingDetails> {
  const url = clip(input.trackingUrl, 500);
  if (url && !/^https?:\/\//i.test(url)) throw new BadRequestException('The tracking link must start with http:// or https://');
  const from = input.estimatedDeliveryFrom ?? null;
  const to = input.estimatedDeliveryTo ?? null;
  for (const d of [from, to]) if (d && Number.isNaN(d.getTime())) throw new BadRequestException('That delivery date isn’t valid');
  if (from && to && from > to) throw new BadRequestException('The expected delivery window ends before it starts');
  return { carrier: clip(input.carrier, 100), trackingNumber: clip(input.trackingNumber, 100), trackingUrl: url, estimatedDeliveryFrom: from, estimatedDeliveryTo: to };
}

/** Delivery state for staff — never the stored payload (it holds the patient's address and is fetched on demand). */
const PARTNER_STATUS_SELECT = {
  select: { status: true, event: true, channels: true, attempts: true, lastError: true, lastAttemptAt: true, sentAt: true },
} as const;

/** The journey so far, newest first (what a patient and staff see as the order's timeline). */
const TRACKING_EVENTS = { orderBy: { occurredAt: 'desc' }, take: 25 } as const;

export const ORDER_INCLUDE = {
  patient: true,
  prescription: { include: { consultation: true } },
  partnerTransmission: PARTNER_STATUS_SELECT,
  trackingEvents: TRACKING_EVENTS,
} satisfies Prisma.OrderInclude;

/** What a patient may see of their own orders: no pharmacy-partner delivery details (they can carry internal errors). */
export const PATIENT_ORDER_INCLUDE = {
  patient: true,
  prescription: { include: { consultation: true } },
  trackingEvents: TRACKING_EVENTS,
} satisfies Prisma.OrderInclude;

export { deliveryAddressOf, type DeliveryAddress } from './delivery-address';

// Fulfilment of prescriptions: each order is one supply (first fill or a
// repeat). Every transition is a conditional update on the current status, so
// two people clicking at once can't skip or repeat a step.
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private trtMonitoring: TrtMonitoringService,
    private partner: PartnerOrdersService,
    private config?: ConfigService,
    private email?: EmailService,
    private billing?: BillingService,
    private notifier?: NotifierService,
  ) {}

  /**
   * The fulfilment queue. Without a search it holds every open order and the finished ones from the last
   * RECENT_DAYS days, so the screen stays quick as history grows. A search looks through all of it: every word typed
   * has to match somewhere (name, tracking number, pharmacy reference, courier, medicine, parcel code, and, unless
   * `contactSearch` is off, email and phone).
   */
  findAll(status?: OrderStatus, search?: string, contactSearch = true) {
    const words = (search ?? '').split(/\s+/).map((w) => w.replace(/^th-/i, '').trim()).filter(Boolean).slice(0, 6);
    const and: Prisma.OrderWhereInput[] = [];
    if (status) and.push({ status });
    if (words.length === 0) {
      const since = new Date(Date.now() - RECENT_DAYS * 24 * 3_600_000);
      and.push({ OR: [{ status: { in: ['PENDING', 'DISPATCHED', 'OUT_FOR_DELIVERY'] } }, { createdAt: { gte: since } }, { deliveredAt: { gte: since } }, { cancelledAt: { gte: since } }] });
    }
    for (const w of words) {
      const has = { contains: w, mode: 'insensitive' as const };
      and.push({
        OR: [
          { patient: { firstName: has } },
          { patient: { lastName: has } },
          ...(contactSearch ? [{ patient: { email: has } }, { patient: { phone: has } }] : []),
          { trackingNumber: has },
          { pharmacyRef: has },
          { carrier: has },
          ...(w.length >= 4 ? [{ id: { endsWith: w.toLowerCase() } }] : []),
          { prescription: { medication: has } },
        ],
      });
    }
    return this.prisma.order.findMany({ where: and.length ? { AND: and } : undefined, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  findByPatient(patientId: string) {
    return this.prisma.order.findMany({ where: { patientId }, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  /** A patient's own orders, without staff-only fulfilment details. */
  findOwn(patientId: string) {
    return this.prisma.order.findMany({ where: { patientId }, include: PATIENT_ORDER_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  /**
   * The first supply, created alongside the prescription. It starts pending, and goes to the pharmacy partner,
   * who packs it and ships it with a courier (see `dispatch`). Set AUTO_DISPATCH_FIRST_ORDER=true to skip that
   * for local testing without a pharmacy: the order is then created already out for delivery, with the
   * delivery address saved on it, and nobody has to enter a carrier or tracking.
   */
  async createInitial(prescription: { id: string; patientId: string }, db: Db) {
    const base = { prescriptionId: prescription.id, patientId: prescription.patientId, sequence: 1 };
    if (this.config?.get<string>('AUTO_DISPATCH_FIRST_ORDER') !== 'true') return db.order.create({ data: base });

    const patient = await db.patient.findUnique({ where: { id: prescription.patientId } });
    const address = patient && deliveryAddressOf(patient);
    if (!address) return db.order.create({ data: base });
    const now = new Date();
    return db.order.create({
      data: {
        ...base,
        status: OrderStatus.OUT_FOR_DELIVERY,
        dispatchedAt: now,
        outForDeliveryAt: now,
        pharmacyRef: 'AUTO',
        shippingAddress: address as unknown as Prisma.InputJsonValue,
      },
    });
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

  /** The pharmacy has packed it and handed it to a courier: record who, the tracking and the expected window. */
  async dispatch(actorId: string, id: string, pharmacyRef?: string | null, shipping: ShippingDetails = {}) {
    const details = cleanShipping(shipping);
    const ref = clip(pharmacyRef, 100);
    const order = await this.find(id);
    this.assertDispensable(order.prescription);

    const address = deliveryAddressOf(order.patient);
    if (!address) throw new BadRequestException('The patient has no complete delivery address on file');

    await this.transition(id, OrderStatus.PENDING, {
      status: OrderStatus.DISPATCHED,
      dispatchedAt: new Date(),
      pharmacyCostSnapshot: await this.costSnapshot(order.prescriptionId),
      ...(ref ? { pharmacyRef: ref } : {}),
      shippingAddress: address as unknown as Prisma.InputJsonValue,
      ...details,
    });
    await this.log(actorId, 'ORDER_DISPATCHED', id, order.patientId, { pharmacyRef: ref, carrier: details.carrier, trackingNumber: details.trackingNumber });
    await this.recordEvent(id, 'PICKED_UP');
    const shipped = await this.find(id);
    await this.tellPatient(shipped, 'SHIPPED');
    return shipped;
  }

  /**
   * The pharmacy says the courier has collected the parcel. That is the one fact only the pharmacy knows, so it is
   * theirs to confirm; it carries no courier, tracking or address (those are ours, and are added afterwards). The
   * order becomes shipped and the patient is told it is on its way. A courier's own pickup scan, when we get one,
   * arrives as a later event and changes nothing.
   */
  async handOver(actorId: string, id: string) {
    const order = await this.find(id);
    if (order.status !== OrderStatus.PENDING) throw new ConflictException('Only an order that hasn’t been shipped yet can be handed over');
    if (!order.readyForPickupAt) await this.prisma.order.updateMany({ where: { id, readyForPickupAt: null }, data: { readyForPickupAt: new Date() } });
    return this.dispatch(actorId, id, null, {});
  }

  /** Corrects or adds the courier, tracking or expected window after it has shipped (the courier often confirms later). */
  async updateShipping(actorId: string, id: string, shipping: ShippingDetails) {
    const details = cleanShipping(shipping);
    const order = await this.find(id);
    if (order.status !== OrderStatus.DISPATCHED && order.status !== OrderStatus.OUT_FOR_DELIVERY) {
      throw new ConflictException('Shipping details can only be changed while the order is on its way');
    }
    await this.prisma.order.update({ where: { id }, data: details });
    await this.log(actorId, 'ORDER_SHIPPING_UPDATED', id, order.patientId, { carrier: details.carrier, trackingNumber: details.trackingNumber });
    return this.find(id);
  }

  async markOutForDelivery(actorId: string, id: string, carrier?: string, trackingNumber?: string, trackingUrl?: string) {
    const extra = cleanShipping({ carrier, trackingNumber, trackingUrl });
    await this.transition(id, OrderStatus.DISPATCHED, {
      status: OrderStatus.OUT_FOR_DELIVERY,
      outForDeliveryAt: new Date(),
      // Only what was given now; what the pharmacy entered when shipping stays.
      ...(extra.carrier ? { carrier: extra.carrier } : {}),
      ...(extra.trackingNumber ? { trackingNumber: extra.trackingNumber } : {}),
      ...(extra.trackingUrl ? { trackingUrl: extra.trackingUrl } : {}),
    });
    const order = await this.find(id);
    await this.log(actorId, 'ORDER_OUT_FOR_DELIVERY', id, order.patientId, { carrier: order.carrier, trackingNumber: order.trackingNumber });
    await this.recordEvent(id, 'OUT_FOR_DELIVERY');
    await this.tellPatient(order, 'OUT_FOR_DELIVERY');
    return order;
  }

  async markDelivered(actorId: string, id: string) {
    await this.transition(id, OrderStatus.OUT_FOR_DELIVERY, { status: OrderStatus.DELIVERED, deliveredAt: new Date() });
    const order = await this.find(id);
    await this.log(actorId, 'ORDER_DELIVERED', id, order.patientId);
    await this.recordEvent(id, 'DELIVERED');
    await this.tellPatient(order, 'DELIVERED');
    return order;
  }

  /** The pharmacy has packed it and is waiting for the courier to collect it. */
  async markReadyForPickup(actorId: string, id: string) {
    const order = await this.find(id);
    if (order.status !== OrderStatus.PENDING) throw new ConflictException('Only an order that is still being prepared can be marked ready for pickup');
    this.assertDispensable(order.prescription);
    if (!deliveryAddressOf(order.patient)) throw new BadRequestException('The patient has no complete delivery address on file');

    await this.prisma.order.update({ where: { id }, data: { readyForPickupAt: order.readyForPickupAt ?? new Date() } });
    await this.log(actorId, 'ORDER_READY_FOR_PICKUP', id, order.patientId);
    await this.recordEvent(id, 'READY_FOR_PICKUP');
    return this.find(id);
  }

  /**
   * The pharmacy can't supply an order (out of stock, a safety concern). It doesn't cancel anything: the order stays
   * as it is, flagged as a problem for our team, who decide whether to cancel and refund or to ask the pharmacy again.
   */
  async reportCannotFulfil(actorId: string, id: string, reason: string) {
    const why = reason?.trim();
    if (!why) throw new BadRequestException('Say why the order can’t be fulfilled');
    if (why.length > 500) throw new BadRequestException('Please keep the reason under 500 characters');
    const order = await this.find(id);
    if (order.status !== OrderStatus.PENDING) throw new ConflictException('Only an order that hasn’t been shipped yet can be reported as unfulfillable');

    // This is the report itself, not just history, so a failure here must not be hidden.
    await this.prisma.orderTrackingEvent.create({ data: { orderId: id, status: 'CANNOT_FULFIL', occurredAt: new Date(), note: why, source: 'MANUAL' } });
    await this.log(actorId, 'ORDER_PHARMACY_CANNOT_FULFIL', id, order.patientId, { reason: why });
    return this.find(id);
  }

  /**
   * One thing that happened to a parcel, from a courier or tracking service (or staff). Always added to the
   * order's history; moves the order forward when it carries it further than it is, never back; fills in the
   * courier, tracking and expected window when given; and emails the patient about the steps that matter.
   * Resending an event (same id) changes nothing.
   */
  async applyTracking(
    orderId: string,
    event: TrackingEventInput,
    source: 'WEBHOOK' | 'POLL' | 'MANUAL' = 'WEBHOOK',
    actorId = 'system:courier',
  ): Promise<'APPLIED' | 'DUPLICATE' | 'IGNORED'> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { patient: true } });
    if (!order || order.status === OrderStatus.CANCELLED) return 'IGNORED';

    // A courier's clock can be wrong; never record the future.
    const at = event.occurredAt.getTime() > Date.now() + 3_600_000 ? new Date() : event.occurredAt;
    try {
      await this.prisma.orderTrackingEvent.create({
        data: { orderId, status: event.status, occurredAt: at, location: event.location, note: event.note, source, externalId: event.externalId },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') return 'DUPLICATE';
      throw err;
    }

    const data: Prisma.OrderUpdateManyMutationInput = {};
    if (event.carrier) data.carrier = event.carrier;
    if (event.trackingNumber && !order.trackingNumber) data.trackingNumber = event.trackingNumber;
    if (event.trackingUrl) data.trackingUrl = event.trackingUrl;
    if (event.estimatedDeliveryFrom) data.estimatedDeliveryFrom = event.estimatedDeliveryFrom;
    if (event.estimatedDeliveryTo) data.estimatedDeliveryTo = event.estimatedDeliveryTo;
    if (event.status === 'READY_FOR_PICKUP' && !order.readyForPickupAt) data.readyForPickupAt = at;

    const target = orderStatusFor(event.status);
    const moves = !!target && rankOf(target) > rankOf(order.status);
    if (moves && target) {
      data.status = target;
      // A step the courier never reported (e.g. delivered, with no pickup event) is filled in with the same time.
      if (rankOf(target) >= 1 && !order.dispatchedAt) {
        data.dispatchedAt = at;
        data.pharmacyCostSnapshot = await this.costSnapshot(order.prescriptionId);
      }
      if (rankOf(target) >= 2 && !order.outForDeliveryAt) data.outForDeliveryAt = at;
      if (target === OrderStatus.DELIVERED) data.deliveredAt = at;
      const address = deliveryAddressOf(order.patient);
      if (!order.shippingAddress && address) data.shippingAddress = address as unknown as Prisma.InputJsonValue;
    }

    let moved = false;
    if (Object.keys(data).length > 0) {
      // Only if nobody moved it meanwhile; losing that race just means the event stays in the history.
      const { count } = await this.prisma.order.updateMany({ where: moves ? { id: orderId, status: order.status } : { id: orderId }, data });
      moved = moves && count === 1;
    }

    if (moved && target) {
      await this.audit.log({
        actorId,
        actorRole: UserRole.ADMIN,
        action: 'ORDER_TRACKING_UPDATE',
        resourceType: 'Order',
        resourceId: orderId,
        patientId: order.patientId,
        metadata: { status: event.status, from: order.status, to: target, source },
      });
    }

    const mail = moved && target ? ({ DISPATCHED: 'SHIPPED', OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY', DELIVERED: 'DELIVERED' } as const)[target as 'DISPATCHED'] : event.status === 'DELIVERY_FAILED' ? 'DELIVERY_FAILED' : null;
    if (mail) await this.tellPatient(await this.find(orderId), mail);
    return 'APPLIED';
  }

  /** Adds a step to the order's history. Best effort: the history is a record, and must never block the step itself. */
  private async recordEvent(orderId: string, status: TrackingStatus, source: 'MANUAL' | 'WEBHOOK' | 'POLL' = 'MANUAL') {
    try {
      await this.prisma.orderTrackingEvent.create({ data: { orderId, status, occurredAt: new Date(), source } });
    } catch (err: any) {
      this.logger.error(`Could not record ${status} for order ${orderId}: ${err?.message}`);
    }
  }

  /** Emails the patient about their order. Never fails the step itself: the order has moved whether or not the email went. */
  private async tellPatient(
    order: { id: string; patientId: string; patient: { email: string; firstName: string; lastName?: string }; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; estimatedDeliveryFrom: Date | null; estimatedDeliveryTo: Date | null },
    kind: 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED',
  ) {
    // The app and the phone are told even when email isn't set up, and the two never hold each other up.
    void this.notifier?.toPatient(order.patientId, { kind: NOTICE[kind], params: { orderId: order.id }, href: '/orders', groupKey: `order:${order.id}` });
    if (kind === 'DELIVERY_FAILED') {
      void this.notifier?.toStaff({ roles: [ClinicianRole.ADMIN] }, {
        kind: NotificationKind.ORDER_PROBLEM,
        params: { patient: `${order.patient.firstName} ${order.patient.lastName ?? ''}`.trim() },
        href: '/orders',
        groupKey: `order-problem:${order.id}`,
      });
    } else if (kind === 'DELIVERED') {
      void this.notifier?.resolve(`order-problem:${order.id}`);
    }
    if (!this.email) return;
    try {
      const portal = this.config?.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3000';
      await this.email.sendOrderUpdateEmail(order.patient.email, order.patient.firstName, kind, {
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        expected: describeEstimate(order.estimatedDeliveryFrom, order.estimatedDeliveryTo),
        ordersUrl: `${portal}/orders`,
      });
    } catch (err: any) {
      this.logger.error(`Order ${kind.toLowerCase()} email failed: ${err?.message}`);
    }
  }

  /** The pharmacy's cost per unit as it is now, written onto the order as it is handed over. */
  private async costSnapshot(prescriptionId: string): Promise<Prisma.InputJsonValue | undefined> {
    const items = await this.prisma.prescriptionItem.findMany({ where: { prescriptionId }, include: { product: true, strength: true } });
    return items.map((it) => ({
      product: it.product.brandName ?? it.product.name,
      strength: it.strength.label,
      quantity: it.quantity,
      unitCost: it.strength.pharmacyUnitCost ? Number(it.strength.pharmacyUnitCost) : null,
    }));
  }

  /** Everything the pharmacy handed over in a month (not cancelled), for checking what we owe it. */
  async statementOrders(year: number, month: number) {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    const orders = await this.prisma.order.findMany({
      where: { dispatchedAt: { gte: from, lt: to }, status: { not: 'CANCELLED' } },
      include: { prescription: { include: { items: { include: { product: true, strength: true } } } } },
    });
    return orders.map((o) => ({
      id: o.id,
      sequence: o.sequence,
      dispatchedAt: o.dispatchedAt!,
      // What it cost when it was handed over; only an order from before that was kept falls back to today's costs.
      items: Array.isArray(o.pharmacyCostSnapshot)
        ? (o.pharmacyCostSnapshot as StatementOrder['items'])
        : o.prescription.items.map((it) => ({ product: it.product.brandName ?? it.product.name, strength: it.strength.label, quantity: it.quantity, unitCost: it.strength.pharmacyUnitCost ? Number(it.strength.pharmacyUnitCost) : null })),
    }));
  }

  /**
   * Stops an order that has not shipped. The patient has already paid, so an admin can also say what happens to their
   * money: refund the latest payment, end the subscription, or both (which is what a declined consultation does).
   * The order is cancelled first; a billing problem is written down for fixing by hand and never undoes the cancel.
   */
  async cancel(actorId: string, id: string, reason: string, money: { refund?: boolean; endSubscription?: boolean } = {}) {
    if (!reason.trim()) throw new BadRequestException('A reason is required to cancel an order');
    // A payment can be matched to an order only for the first supply (it was paid for at checkout). A repeat is billed
    // by the subscription, not per order, so "the latest payment" could be a different month's: refund that in Stripe.
    if (money.refund && (await this.find(id)).sequence !== 1) {
      throw new BadRequestException('A repeat supply isn’t refunded from here: it is billed by the subscription, so refund the right payment in Stripe');
    }
    await this.transition(id, OrderStatus.PENDING, {
      status: OrderStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: reason.trim(),
    });
    const order = await this.find(id);

    let billingNote: string | null = null;
    if ((money.refund || money.endSubscription) && this.billing) {
      const patient = order.patient;
      if (money.refund && money.endSubscription) {
        const outcome = await this.billing.cancelAndRefund(patient, { paidBefore: order.createdAt });
        billingNote =
          outcome.status === 'REFUNDED'
            ? `Subscription ended and the latest payment refunded${outcome.refundId ? ` (${outcome.refundId})` : ''}`
            : outcome.status === 'NOT_REQUIRED'
            ? `Nothing to end or refund: ${outcome.reason}`
            : `Billing could not be changed (${outcome.error}) — fix it in Stripe by hand`;
      } else if (money.refund) {
        billingNote = await this.billing.refundLatestPayment(patient, { paidBefore: order.createdAt });
      } else {
        billingNote = await this.billing.cancelAtPeriodEnd(patient);
      }
      await this.prisma.order.update({ where: { id }, data: { cancelBillingNote: billingNote } });
    }
    await this.log(actorId, 'ORDER_CANCELLED', id, order.patientId, { reason: reason.trim(), refund: !!money.refund, endSubscription: !!money.endSubscription, billingNote });
    // If the pharmacy partner was already given this order, tell it not to dispatch.
    await this.partner.markCancelled([id]);
    await this.partner.flushCancellations();
    return this.find(id);
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
