import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { BillingService } from '../stripe/billing.service';
import { DosePricingService } from '../stripe/dose-pricing.service';
import { RefundRequestsService } from '../stripe/refund-requests.service';
import { prescriptionFeeCents } from '../stripe/prescription-fee';
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

/** An order nobody has paid for after this long gets one reminder email. */
const PAYMENT_REMINDER_AFTER_DAYS = 3;

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
    private dosePricing?: DosePricingService,
    private refundRequests?: RefundRequestsService,
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
    // The pharmacy (the caller that can't search by contact details) never sees a supply that has not been paid for yet.
    if (!contactSearch) and.push({ status: { not: OrderStatus.AWAITING_PAYMENT } });
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
  /** Throws when a testosterone supply must wait for blood tests. The same hold a repeat is subject to. */
  assertTrtMonitoring(prescriptionId: string, db: Db = this.prisma) {
    return this.trtMonitoring.assertRepeatAllowed(prescriptionId, db);
  }

  async createRepeat(actorId: string, prescriptionId: string, db: Db = this.prisma) {
    const rx = await db.prescription.findUnique({
      where: { id: prescriptionId },
      include: { orders: true, patient: { select: { subscriptionEndedAt: true, paysPerSupply: true, paymentFailedAt: true } } },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    this.assertDispensable(rx);
    if (rx.patient?.subscriptionEndedAt) {
      throw new BadRequestException('The patient’s subscription has ended — no further supplies can be ordered');
    }

    if (rx.patient?.paymentFailedAt) {
      throw new BadRequestException('The patient’s last payment failed — no further supplies can be ordered until a payment goes through');
    }

    const live = rx.orders.filter((o) => o.status !== OrderStatus.CANCELLED);
    if (live.some((o) => o.status === OrderStatus.PENDING || o.status === OrderStatus.AWAITING_PAYMENT)) {
      throw new ConflictException('There is already an order waiting to be dispatched for this prescription');
    }
    const repeatsUsed = Math.max(live.length - 1, 0);
    if (repeatsUsed >= rx.refillsAllowed) {
      throw new BadRequestException('This prescription has no repeats left — issue a new prescription for the next order');
    }
    await this.trtMonitoring.assertRepeatAllowed(prescriptionId, db);

    const sequence = Math.max(0, ...rx.orders.map((o) => o.sequence)) + 1;
    // A patient who pays per supply pays for this one before it goes anywhere: it is held until the payment arrives.
    const needsPayment = !!rx.patient?.paysPerSupply;
    const order = await db.order.create({ data: { prescriptionId, patientId: rx.patientId, sequence, ...(needsPayment ? { status: OrderStatus.AWAITING_PAYMENT } : {}) } });
    // Whatever the patient asked for is now answered, whether the doctor placed this from the shipments list or after a check-in.
    await db.refillRequest.updateMany({ where: { prescriptionId, resolvedAt: null }, data: { resolvedAt: new Date(), orderId: order.id } });
    await this.log(actorId, 'ORDER_CREATED', order.id, rx.patientId, { prescriptionId, sequence }, db);
    if (needsPayment) {
      // The payment request goes out now, or on the next sweep when this runs inside someone else's transaction.
      if (db === this.prisma) await this.requestPayment(order.id);
    } else if (db === this.prisma) {
      // Hand it to the pharmacy partner straight away (when a channel is set up); a failure is retried later.
      await this.partner.trySend(order.id);
    }
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
    // A refund may have been waiting for this parcel to come back: it didn't, so an admin decides again.
    await this.refundRequests?.onParcelDelivered(id);
    return order;
  }

  /**
   * The parcel is back with the pharmacy (the courier brought it back, or the patient refused it). The order is closed, and a
   * refund that was waiting for the parcel is made. Marked by hand when no courier reports it.
   */
  async markReturned(actorId: string, id: string) {
    const order = await this.find(id);
    if (order.status !== OrderStatus.DISPATCHED && order.status !== OrderStatus.OUT_FOR_DELIVERY) {
      throw new ConflictException('Only a parcel that is on its way can be marked as returned');
    }
    await this.transition(id, order.status as OrderStatus, { status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancelReason: 'Parcel returned to the pharmacy' });
    await this.log(actorId, 'ORDER_RETURNED', id, order.patientId);
    await this.recordEvent(id, 'RETURNED');
    await this.refundRequests?.onParcelReturned(id);
    return this.find(id);
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
    // A refund may be waiting for this parcel: back with us it is paid out, delivered it goes back to an admin to decide.
    if (event.status === 'RETURNED') await this.refundRequests?.onParcelReturned(orderId);
    else if (event.status === 'DELIVERED') await this.refundRequests?.onParcelDelivered(orderId);
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
    // The app and the phone are told even when email isn't set up, and the two never hold each other up. These are
    // waited for, one after another where order matters: an alert written late would otherwise land after the delivery
    // that closes it (a failed attempt then a delivery in quick succession), and an un-awaited write can be cut off on a
    // serverless host. A failure here is logged and never fails the step.
    await this.quietly(`tell the patient about order ${order.id}`, () =>
      this.notifier?.toPatient(order.patientId, { kind: NOTICE[kind], params: { orderId: order.id }, href: '/orders', groupKey: `order:${order.id}` }),
    );
    if (kind === 'DELIVERY_FAILED') {
      await this.quietly(`raise the problem alert for order ${order.id}`, async () => {
        await this.notifier?.toStaff({ roles: [ClinicianRole.ADMIN] }, {
          kind: NotificationKind.ORDER_PROBLEM,
          params: { patient: `${order.patient.firstName} ${order.patient.lastName ?? ''}`.trim() },
          href: '/orders',
          groupKey: `order-problem:${order.id}`,
        });
        // Another update may have delivered the order while the alert was being written: then it is already handled.
        const now = await this.prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
        if (now?.status === 'DELIVERED') await this.notifier?.resolve(`order-problem:${order.id}`);
      });
    } else if (kind === 'DELIVERED') {
      await this.quietly(`close the problem alert for order ${order.id}`, () => this.notifier?.resolve(`order-problem:${order.id}`));
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

  /** Runs a notification step and logs a failure instead of throwing: the order has moved whether or not anyone was told. */
  private async quietly(what: string, run: () => Promise<unknown> | undefined) {
    try {
      await run();
    } catch (err: any) {
      this.logger.error(`Could not ${what}: ${err?.message}`, err?.stack);
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
    const current = await this.find(id);
    if (current.status === OrderStatus.AWAITING_PAYMENT && current.paymentInvoiceId) await this.billing?.voidSupplyInvoice(current.paymentInvoiceId);
    await this.transition(id, current.status === OrderStatus.AWAITING_PAYMENT ? OrderStatus.AWAITING_PAYMENT : OrderStatus.PENDING, {
      status: OrderStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: reason.trim(),
    });
    const order = await this.find(id);

    let billingNote: string | null = null;
    if ((money.refund || money.endSubscription) && this.billing) {
      const patient = order.patient;
      if (money.refund && money.endSubscription) {
        const outcome = await this.billing.cancelAndRefund(patient, { paidBefore: order.createdAt, prescriptionIssuedAt: order.prescription.issuedAt });
        billingNote =
          outcome.status === 'REFUNDED'
            ? `Subscription ended and the latest payment refunded${outcome.refundId ? ` (${outcome.refundId})` : ''}`
            : outcome.status === 'NOT_REQUIRED'
            ? `Nothing to end or refund: ${outcome.reason}`
            : `Billing could not be changed (${outcome.error}) — fix it in Stripe by hand`;
      } else if (money.refund) {
        billingNote = await this.billing.refundLatestPayment(patient, { paidBefore: order.createdAt, prescriptionIssuedAt: order.prescription.issuedAt });
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
    const unpaid = await db.order.findMany({ where: { prescriptionId, status: OrderStatus.AWAITING_PAYMENT, paymentInvoiceId: { not: null } }, select: { paymentInvoiceId: true } });
    for (const o of unpaid) await this.billing?.voidSupplyInvoice(o.paymentInvoiceId!);
    const pending = await db.order.findMany({ where: { prescriptionId, status: { in: [OrderStatus.PENDING, OrderStatus.AWAITING_PAYMENT] } }, select: { id: true } });
    const result = await db.order.updateMany({
      where: { id: { in: pending.map((o) => o.id) }, status: { in: [OrderStatus.PENDING, OrderStatus.AWAITING_PAYMENT] } },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
    });
    await this.partner.markCancelled(pending.map((o) => o.id), db);
    if (db === this.prisma) await this.partner.flushCancellations();
    return result;
  }

  /**
   * Asks the patient to pay for an order that is waiting for it: makes the invoice, tells them, and records it. Safe to
   * repeat: an order that already has its invoice is left alone. Never throws (it is retried by the sweep).
   */
  async requestPayment(orderId: string): Promise<boolean> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { patient: true, prescription: { include: { consultation: true, items: { include: { product: true, strength: true } } } } },
      });
      if (!order || order.status !== OrderStatus.AWAITING_PAYMENT || order.paymentInvoiceId) return false;
      if (!this.billing || !this.dosePricing) throw new Error('Billing is not available');
      const items = order.prescription.items;
      const priceIds = this.dosePricing.priceIdsFor(
        order.prescription.consultation?.kind ?? '',
        items.map((i) => ({ category: i.product.category, titrationStep: i.strength.titrationStep, stripePriceId: i.strength.stripePriceId })),
      );
      if (!priceIds) throw new Error('No price is set for this treatment');
      const description = items.length ? items.map((i) => `${i.product.brandName ?? i.product.name} ${i.strength.label}`).join(' + ') : 'Your next supply';
      // Each new prescription carries the doctor's fee, for patients whose first payment did.
      // A "come back" order on a prescription whose fee was already paid carries none.
      const fee = !order.reorder && order.patient.prescriptionFeePaidCents != null ? prescriptionFeeCents(this.config) : 0;
      const invoice = await this.billing.createSupplyInvoice(order.patient, { id: order.id, patientId: order.patientId, description }, priceIds, fee);
      await this.prisma.order.update({
        where: { id: order.id },
        data: { paymentInvoiceId: invoice.invoiceId, paymentUrl: invoice.url, paymentAmountCents: invoice.amountCents, paymentCurrency: invoice.currency },
      });
      // Account credit that covers all of it leaves nothing to pay: Stripe settles it and the payment event releases the order.
      if (!invoice.paid && invoice.url) {
        if (order.reorder) {
          // Their sign-in is closed, so the offer goes by email only: it is theirs until the prescription runs out.
          const until = (order.prescription.dispenseUntil ?? order.prescription.validUntil)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) ?? '';
          await this.email?.sendComeBackEmail(order.patient.email, order.patient.firstName, { amount: invoice.amountCents, currency: invoice.currency, payUrl: invoice.url, until });
        } else {
          await this.notifier?.toPatient(order.patientId, { kind: NotificationKind.ORDER_PAYMENT_DUE, params: { orderId: order.id }, href: '/orders', groupKey: `order-payment:${order.id}` });
          await this.email?.sendSupplyPaymentEmail(order.patient.email, order.patient.firstName, { amount: invoice.amountCents, currency: invoice.currency, payUrl: invoice.url });
        }
      }
      return true;
    } catch (err: any) {
      this.logger.error(`Asking for payment for order ${orderId} failed: ${err?.message}`);
      return false;
    }
  }

  /**
   * A returning patient chooses to subscribe instead of paying once: their waiting "come back" order's medicine at the
   * subscription price. Null when they have no such order waiting.
   */
  async startReturnSubscription(patientId: string): Promise<{ clientSecret: string; amountDueCents: number; totalCents: number; currency: string } | null> {
    const order = await this.prisma.order.findFirst({
      where: { patientId, reorder: true, status: OrderStatus.AWAITING_PAYMENT },
      orderBy: { createdAt: 'desc' },
      include: { patient: true, prescription: { include: { consultation: true, items: { include: { product: true, strength: true } } } } },
    });
    if (!order || !this.billing || !this.dosePricing) return null;
    const items = order.prescription.items;
    const priceIds = this.dosePricing.priceIdsFor(
      order.prescription.consultation?.kind ?? '',
      items.map((i) => ({ category: i.product.category, titrationStep: i.strength.titrationStep, stripePriceId: i.strength.stripePriceId })),
    );
    if (!priceIds) return null;
    const made = await this.billing.createReturnSubscription(order.patient, { id: order.id, patientId }, priceIds);
    return { clientSecret: made.clientSecret, amountDueCents: made.amountDueCents, totalCents: made.totalCents, currency: made.currency };
  }

  /**
   * The first month of a returning patient's new subscription was paid: their waiting order goes to the pharmacy, their account
   * is open again on the subscription, and the supply invoice they did not use is withdrawn. Safe to repeat.
   */
  async markReturnSubscribed(orderId: string, subscriptionId: string | null, customerId: string | null): Promise<boolean> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return false;
    const { count } = await this.prisma.order.updateMany({ where: { id: order.id, status: OrderStatus.AWAITING_PAYMENT }, data: { status: OrderStatus.PENDING, paidAt: new Date() } });
    if (count === 0) return false;
    if (order.paymentInvoiceId) await this.billing?.voidSupplyInvoice(order.paymentInvoiceId);
    await this.prisma.patient.update({
      where: { id: order.patientId },
      data: {
        accessClosedAt: null, accessClosedReason: null, subscriptionEndedAt: null, lapsedEmailsSent: 0, lapsedEmailAt: null, paysPerSupply: false,
        ...(subscriptionId && { stripeSubscriptionId: subscriptionId }),
        ...(customerId && { stripeCustomerId: customerId }),
      },
    });
    await this.log(order.patientId, 'ORDER_PAID', order.id, order.patientId, { subscriptionId });
    await this.log(order.patientId, 'ACCESS_REOPENED', order.id, order.patientId, { subscriptionId });
    await this.notifier?.resolve(`order-payment:${order.id}`);
    await this.partner.trySend(order.id);
    return true;
  }

  /** Stripe says the invoice for an order was paid: release it to the pharmacy. Safe to repeat (the second call finds nothing to do). */
  async markPaid(invoiceId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({ where: { paymentInvoiceId: invoiceId } });
    if (!order) return false;
    const { count } = await this.prisma.order.updateMany({
      where: { id: order.id, status: OrderStatus.AWAITING_PAYMENT },
      data: { status: OrderStatus.PENDING, paidAt: new Date() },
    });
    if (count === 0) return false;
    await this.log(order.patientId, 'ORDER_PAID', order.id, order.patientId, { invoiceId });
    // Someone who came back to a prescription after a first-order refund is a patient again, paying for each supply.
    if (order.reorder) {
      await this.prisma.patient.update({ where: { id: order.patientId }, data: { accessClosedAt: null, accessClosedReason: null, subscriptionEndedAt: null, lapsedEmailsSent: 0, lapsedEmailAt: null, paysPerSupply: true } });
      await this.log(order.patientId, 'ACCESS_REOPENED', order.id, order.patientId, { invoiceId });
    }
    await this.notifier?.resolve(`order-payment:${order.id}`);
    await this.partner.trySend(order.id);
    return true;
  }

  /**
   * After a first-order refund: the prescription is still good for a few days, so the same treatment is offered again for the
   * medicine only (no second prescription fee). Made only when that prescription was never supplied and has not run out.
   * Returns the offer, or null when there is nothing to offer (then the patient is simply told their account is closed).
   */
  async offerReturn(patientId: string): Promise<{ orderId: string; until: Date; payUrl: string | null; amountCents: number | null; currency: string | null } | null> {
    const rx = await this.prisma.prescription.findFirst({
      where: { patientId, status: PrescriptionStatus.ACTIVE },
      orderBy: { issuedAt: 'desc' },
      include: { orders: true },
    });
    if (!rx) return null;
    const until = rx.dispenseUntil ?? rx.validUntil;
    if (!until || until <= new Date()) return null;
    // Already offered: the patient asking again (through the quiz) gets the same link back by email.
    const offered = rx.orders.find((o) => o.reorder && o.status === OrderStatus.AWAITING_PAYMENT && o.paymentUrl);
    if (offered) {
      const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { email: true, firstName: true } });
      if (patient) await this.email?.sendComeBackEmail(patient.email, patient.firstName, { amount: offered.paymentAmountCents ?? 0, currency: offered.paymentCurrency ?? 'eur', payUrl: offered.paymentUrl!, until: until.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) });
      return { orderId: offered.id, until, payUrl: offered.paymentUrl, amountCents: offered.paymentAmountCents, currency: offered.paymentCurrency };
    }
    const open: string[] = [OrderStatus.PENDING, OrderStatus.AWAITING_PAYMENT, OrderStatus.DISPATCHED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED];
    if (rx.orders.some((o) => open.includes(o.status))) return null;
    const sequence = Math.max(0, ...rx.orders.map((o) => o.sequence)) + 1;
    const order = await this.prisma.order.create({ data: { prescriptionId: rx.id, patientId, sequence, status: OrderStatus.AWAITING_PAYMENT, reorder: true } });
    await this.log('system:refund', 'ORDER_CREATED', order.id, patientId, { prescriptionId: rx.id, sequence, reorder: true });
    await this.requestPayment(order.id);
    const asked = await this.prisma.order.findUnique({ where: { id: order.id }, select: { paymentUrl: true, paymentAmountCents: true, paymentCurrency: true } });
    return { orderId: order.id, until, payUrl: asked?.paymentUrl ?? null, amountCents: asked?.paymentAmountCents ?? null, currency: asked?.paymentCurrency ?? null };
  }

  /**
   * Runs often: asks for payment on orders that could not be asked yet (the first attempt failed, or the order was made
   * inside a transaction), and reminds anyone who has not paid after a few days. One reminder each.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepPayments(): Promise<{ requested: number; reminded: number }> {
    // A supply nobody paid for in time can't be filled once its prescription is past the pharmacy's 15 days: close it.
    const now = new Date();
    const stale = await this.prisma.order.findMany({
      where: { status: OrderStatus.AWAITING_PAYMENT, prescription: { OR: [{ dispenseUntil: { lt: now } }, { dispenseUntil: null, validUntil: { lt: now } }] } },
      select: { id: true, paymentInvoiceId: true },
      take: 50,
    });
    for (const o of stale) {
      if (o.paymentInvoiceId) await this.billing?.voidSupplyInvoice(o.paymentInvoiceId);
      await this.prisma.order.updateMany({ where: { id: o.id, status: OrderStatus.AWAITING_PAYMENT }, data: { status: OrderStatus.CANCELLED, cancelledAt: now, cancelReason: 'The prescription ran out before it was paid for' } });
    }
    const unasked = await this.prisma.order.findMany({ where: { status: OrderStatus.AWAITING_PAYMENT, paymentInvoiceId: null }, select: { id: true }, take: 50 });
    let requested = 0;
    for (const o of unasked) if (await this.requestPayment(o.id)) requested++;

    const before = new Date(Date.now() - PAYMENT_REMINDER_AFTER_DAYS * 86_400_000);
    const waiting = await this.prisma.order.findMany({
      where: { status: OrderStatus.AWAITING_PAYMENT, paymentUrl: { not: null }, paymentReminderAt: null, createdAt: { lt: before } },
      include: { patient: true },
      take: 50,
    });
    let reminded = 0;
    for (const o of waiting) {
      // Claimed first, so two sweeps at once send one reminder.
      const claimed = await this.prisma.order.updateMany({ where: { id: o.id, paymentReminderAt: null, status: OrderStatus.AWAITING_PAYMENT }, data: { paymentReminderAt: new Date() } });
      if (claimed.count === 0) continue;
      await this.email?.sendSupplyPaymentEmail(o.patient.email, o.patient.firstName, { amount: o.paymentAmountCents ?? 0, currency: o.paymentCurrency ?? 'eur', payUrl: o.paymentUrl!, reminder: true }).catch((err: any) => this.logger.error(`Payment reminder for order ${o.id} failed: ${err?.message}`));
      reminded++;
    }
    return { requested, reminded };
  }

  /**
   * Stops every supply of a patient that has not shipped (waiting for payment, or still at the pharmacy), e.g. when their
   * subscription is ended and they are refunded. What has already left the pharmacy is not touched.
   */
  async cancelUnshippedFor(patientId: string, reason: string): Promise<number> {
    const open = await this.prisma.order.findMany({
      where: { patientId, status: { in: [OrderStatus.PENDING, OrderStatus.AWAITING_PAYMENT] } },
      select: { prescriptionId: true },
    });
    let stopped = 0;
    for (const rxId of [...new Set(open.map((o) => o.prescriptionId))]) stopped += (await this.cancelPendingFor(rxId, reason)).count;
    return stopped;
  }

  private assertDispensable(rx: { status: string; validUntil: Date | null; dispenseUntil?: Date | null }) {
    if (rx.status !== PrescriptionStatus.ACTIVE) {
      throw new BadRequestException(`The prescription is ${rx.status.toLowerCase()} and can’t be dispensed`);
    }
    // The pharmacy's deadline: 15 days after it was issued. Older prescriptions have only the end of their treatment.
    const lastDay = rx.dispenseUntil ?? rx.validUntil;
    if (lastDay && lastDay < new Date()) {
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
