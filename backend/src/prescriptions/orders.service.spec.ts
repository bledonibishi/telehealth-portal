import { OrdersService, deliveryAddressOf } from './orders.service';

const PATIENT = {
  id: 'p-1', firstName: 'Emma', lastName: 'White', phone: '+383 44 000 000',
  addressLine1: 'Rr. Nëna Terezë 1', addressLine2: null, city: 'Prishtinë', postcode: '10000', country: 'Kosovo',
};
const ACTIVE_RX = { id: 'rx-1', patientId: 'p-1', status: 'ACTIVE', validUntil: new Date(Date.now() + 86_400_000), refillsAllowed: 2 };

describe('OrdersService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: OrdersService;
  let trtMonitoring: { assertRepeatAllowed: jest.Mock };
  let partner: { trySend: jest.Mock; markCancelled: jest.Mock; flushCancellations: jest.Mock };

  beforeEach(() => {
    partner = { trySend: jest.fn(), markCancelled: jest.fn(), flushCancellations: jest.fn() };
    prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ id: 'o-1', status: 'PENDING', patient: PATIENT, prescription: ACTIVE_RX }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'o-new' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'o-new', ...data })),
      },
      prescription: { findUnique: jest.fn() },
      refillRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    audit = { log: jest.fn() };
    trtMonitoring = { assertRepeatAllowed: jest.fn() };
    service = new OrdersService(prisma, audit as any, trtMonitoring as any, partner as any);
  });

  describe('createInitial', () => {
    beforeEach(() => { prisma.patient = { findUnique: jest.fn().mockResolvedValue(PATIENT) }; });
    const withFlag = (value: string | undefined) =>
      new OrdersService(prisma, audit as any, trtMonitoring as any, partner as any, { get: () => value } as any);

    it('creates the first order pending, for the pharmacy to ship', async () => {
      await service.createInitial({ id: 'rx-1', patientId: 'p-1' }, prisma);
      expect(prisma.order.create).toHaveBeenCalledWith({ data: { prescriptionId: 'rx-1', patientId: 'p-1', sequence: 1 } });
    });

    it('with AUTO_DISPATCH_FIRST_ORDER=true creates it already out for delivery, with the address snapshot', async () => {
      await withFlag('true').createInitial({ id: 'rx-1', patientId: 'p-1' }, prisma);
      expect(prisma.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sequence: 1, status: 'OUT_FOR_DELIVERY', dispatchedAt: expect.any(Date), outForDeliveryAt: expect.any(Date), shippingAddress: expect.objectContaining({ city: 'Prishtinë' }) }),
      });
    });

    it('leaves it pending even in auto mode when there is no delivery address', async () => {
      prisma.patient.findUnique.mockResolvedValue({ ...PATIENT, addressLine1: null });
      await withFlag('true').createInitial({ id: 'rx-1', patientId: 'p-1' }, prisma);
      expect(prisma.order.create.mock.calls[0][0].data.status).toBeUndefined();
    });
  });

  describe('shipping details and patient emails', () => {
    let email: { sendOrderUpdateEmail: jest.Mock };
    let withEmail: OrdersService;
    beforeEach(() => {
      email = { sendOrderUpdateEmail: jest.fn().mockResolvedValue(undefined) };
      withEmail = new OrdersService(prisma, audit as any, trtMonitoring as any, partner as any, { get: () => undefined } as any, email as any);
      prisma.order.update = jest.fn().mockResolvedValue({});
    });
    const patientOrder = (over: object = {}) => ({
      id: 'o-1', status: 'DISPATCHED', patient: { ...PATIENT, email: 'p@example.com', firstName: 'Emma' }, prescription: ACTIVE_RX,
      carrier: 'DHL', trackingNumber: 'T123', trackingUrl: 'https://dhl.example/T123', estimatedDeliveryFrom: new Date('2026-10-13T08:00:00Z'), estimatedDeliveryTo: new Date('2026-10-14T08:00:00Z'), ...over,
    });

    it('records the courier, tracking and expected window when shipping, with the pharmacy reference optional', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({ ...patientOrder({ status: 'PENDING' }) }).mockResolvedValue(patientOrder());
      await withEmail.dispatch('prov-1', 'o-1', undefined, {
        carrier: ' DHL ', trackingNumber: 'T123', trackingUrl: 'https://dhl.example/T123',
        estimatedDeliveryFrom: new Date('2026-10-13T08:00:00Z'), estimatedDeliveryTo: new Date('2026-10-14T08:00:00Z'),
      });
      const data = prisma.order.updateMany.mock.calls[0][0].data;
      expect(data).toMatchObject({ status: 'DISPATCHED', carrier: 'DHL', trackingNumber: 'T123', trackingUrl: 'https://dhl.example/T123' });
      expect(data.pharmacyRef).toBeUndefined();
    });

    it('emails the patient that it has shipped, with the expected window and tracking', async () => {
      prisma.order.findUnique.mockResolvedValue(patientOrder());
      await withEmail.dispatch('prov-1', 'o-1', 'PH-1', {});
      expect(email.sendOrderUpdateEmail).toHaveBeenCalledWith('p@example.com', 'Emma', 'SHIPPED', expect.objectContaining({
        carrier: 'DHL', trackingNumber: 'T123', trackingUrl: 'https://dhl.example/T123', expected: 'Tuesday 13 – Wednesday 14 October',
      }));
    });

    it('rejects a tracking link that is not a web link, and a window that ends before it starts', async () => {
      await expect(withEmail.dispatch('prov-1', 'o-1', null, { trackingUrl: 'javascript:alert(1)' })).rejects.toThrow(/http/);
      await expect(withEmail.dispatch('prov-1', 'o-1', null, { estimatedDeliveryFrom: new Date('2026-10-15'), estimatedDeliveryTo: new Date('2026-10-14') })).rejects.toThrow(/ends before/);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('still ships the order when the email fails', async () => {
      prisma.order.findUnique.mockResolvedValue(patientOrder());
      email.sendOrderUpdateEmail.mockRejectedValue(new Error('smtp down'));
      await expect(withEmail.dispatch('prov-1', 'o-1', 'PH-1', {})).resolves.toBeDefined();
    });

    it('lets the pharmacy correct the shipping details while it is on its way, not before or after', async () => {
      prisma.order.findUnique.mockResolvedValue(patientOrder());
      await withEmail.updateShipping('prov-1', 'o-1', { trackingNumber: 'T999' });
      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'o-1' }, data: expect.objectContaining({ trackingNumber: 'T999' }) });

      prisma.order.findUnique.mockResolvedValue(patientOrder({ status: 'DELIVERED' }));
      await expect(withEmail.updateShipping('prov-1', 'o-1', { trackingNumber: 'T1' })).rejects.toThrow(/on its way/);
    });

    it('marking it out for delivery keeps the courier already recorded and emails the patient', async () => {
      prisma.order.findUnique.mockResolvedValue(patientOrder({ status: 'OUT_FOR_DELIVERY' }));
      await withEmail.markOutForDelivery('prov-1', 'o-1');
      const data = prisma.order.updateMany.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('carrier');
      expect(email.sendOrderUpdateEmail).toHaveBeenCalledWith('p@example.com', 'Emma', 'OUT_FOR_DELIVERY', expect.anything());
    });

    it('emails the patient when it is delivered', async () => {
      prisma.order.findUnique.mockResolvedValue(patientOrder({ status: 'DELIVERED' }));
      await withEmail.markDelivered('prov-1', 'o-1');
      expect(email.sendOrderUpdateEmail).toHaveBeenCalledWith('p@example.com', 'Emma', 'DELIVERED', expect.anything());
    });

    it('also tells the patient’s phone, in general words, even when email is not set up', async () => {
      const push = { sendToPatient: jest.fn().mockResolvedValue(undefined) };
      const phoneOnly = new OrdersService(prisma, audit as any, trtMonitoring as any, partner as any, { get: () => undefined } as any, undefined, undefined, push as any);
      prisma.order.findUnique.mockResolvedValue(patientOrder({ status: 'DELIVERED' }));
      await phoneOnly.markDelivered('prov-1', 'o-1');
      expect(push.sendToPatient).toHaveBeenCalledTimes(1);
      const [, message] = push.sendToPatient.mock.calls[0];
      expect(message.title).toMatch(/arrived/i);
      expect(JSON.stringify(message)).not.toMatch(/Emma|p@example|street/i);
    });
  });

  describe('applyTracking (courier and tracking-service updates)', () => {
    let email: { sendOrderUpdateEmail: jest.Mock };
    let tracking: OrdersService;
    const base = (over: object = {}) => ({
      id: 'o-1', patientId: 'p-1', status: 'PENDING', patient: { ...PATIENT, email: 'p@example.com', firstName: 'Emma' }, prescription: ACTIVE_RX,
      dispatchedAt: null, outForDeliveryAt: null, deliveredAt: null, readyForPickupAt: null, shippingAddress: null,
      carrier: null, trackingNumber: null, trackingUrl: null, estimatedDeliveryFrom: null, estimatedDeliveryTo: null, ...over,
    });
    const event = (over: object = {}) => ({ status: 'PICKED_UP' as const, occurredAt: new Date('2026-10-05T08:00:00Z'), ...over });
    const lastUpdate = () => prisma.order.updateMany.mock.calls.at(-1)?.[0];

    beforeEach(() => {
      email = { sendOrderUpdateEmail: jest.fn().mockResolvedValue(undefined) };
      tracking = new OrdersService(prisma, audit as any, trtMonitoring as any, partner as any, { get: () => undefined } as any, email as any);
      prisma.orderTrackingEvent = { create: jest.fn().mockResolvedValue({}) };
      prisma.order.findUnique.mockResolvedValue(base());
    });

    it('records the step and moves a pending order to shipped, with the time it happened, and tells the patient', async () => {
      await expect(tracking.applyTracking('o-1', event({ carrier: 'Posta BEKI', trackingNumber: 'T1', externalId: 'e1' }))).resolves.toBe('APPLIED');
      expect(prisma.orderTrackingEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: 'o-1', status: 'PICKED_UP', source: 'WEBHOOK', externalId: 'e1' }) });
      expect(lastUpdate()).toEqual({
        where: { id: 'o-1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'DISPATCHED', dispatchedAt: new Date('2026-10-05T08:00:00Z'), carrier: 'Posta BEKI', trackingNumber: 'T1', shippingAddress: expect.objectContaining({ city: 'Prishtinë' }) }),
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'system:courier', action: 'ORDER_TRACKING_UPDATE', metadata: expect.objectContaining({ from: 'PENDING', to: 'DISPATCHED' }) }));
      expect(email.sendOrderUpdateEmail).toHaveBeenCalledWith('p@example.com', 'Emma', 'SHIPPED', expect.anything());
    });

    it('a delivery with no earlier pickup fills in the skipped steps with the same time', async () => {
      await tracking.applyTracking('o-1', event({ status: 'DELIVERED' }));
      expect(lastUpdate().data).toEqual(expect.objectContaining({
        status: 'DELIVERED', dispatchedAt: new Date('2026-10-05T08:00:00Z'), outForDeliveryAt: new Date('2026-10-05T08:00:00Z'), deliveredAt: new Date('2026-10-05T08:00:00Z'),
      }));
      // One email for where it ended up, not three for steps nobody saw.
      expect(email.sendOrderUpdateEmail).toHaveBeenCalledTimes(1);
      expect(email.sendOrderUpdateEmail).toHaveBeenCalledWith('p@example.com', 'Emma', 'DELIVERED', expect.anything());
    });

    it('never moves an order backwards, but still keeps the event in the history', async () => {
      prisma.order.findUnique.mockResolvedValue(base({ status: 'DELIVERED', deliveredAt: new Date() }));
      await tracking.applyTracking('o-1', event({ status: 'IN_TRANSIT' }));
      expect(prisma.orderTrackingEvent.create).toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(email.sendOrderUpdateEmail).not.toHaveBeenCalled();
    });

    it('records a resend (same event id) only once and changes nothing the second time', async () => {
      prisma.orderTrackingEvent.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(tracking.applyTracking('o-1', event({ externalId: 'e1' }))).resolves.toBe('DUPLICATE');
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(email.sendOrderUpdateEmail).not.toHaveBeenCalled();
    });

    it('ignores an order that does not exist or was cancelled', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(tracking.applyTracking('nope', event())).resolves.toBe('IGNORED');
      prisma.order.findUnique.mockResolvedValue(base({ status: 'CANCELLED' }));
      await expect(tracking.applyTracking('o-1', event())).resolves.toBe('IGNORED');
      expect(prisma.orderTrackingEvent.create).not.toHaveBeenCalled();
    });

    it('a failed delivery is history only, but the patient is told', async () => {
      prisma.order.findUnique.mockResolvedValue(base({ status: 'OUT_FOR_DELIVERY' }));
      await tracking.applyTracking('o-1', event({ status: 'DELIVERY_FAILED', note: 'Nobody home' }));
      expect(prisma.orderTrackingEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'DELIVERY_FAILED', note: 'Nobody home' }) });
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(email.sendOrderUpdateEmail).toHaveBeenCalledWith('p@example.com', 'Emma', 'DELIVERY_FAILED', expect.anything());
    });

    it('updates the courier link and expected window without changing the status', async () => {
      prisma.order.findUnique.mockResolvedValue(base({ status: 'DISPATCHED' }));
      await tracking.applyTracking('o-1', event({ status: 'IN_TRANSIT', trackingUrl: 'https://c.example/T1', estimatedDeliveryTo: new Date('2026-10-15') }));
      expect(lastUpdate()).toEqual({ where: { id: 'o-1' }, data: { trackingUrl: 'https://c.example/T1', estimatedDeliveryTo: new Date('2026-10-15') } });
    });

    it('does not replace a tracking number the order already has', async () => {
      prisma.order.findUnique.mockResolvedValue(base({ status: 'DISPATCHED', trackingNumber: 'KEEP' }));
      await tracking.applyTracking('o-1', event({ status: 'IN_TRANSIT', trackingNumber: 'OTHER', carrier: 'DHL' }));
      expect(lastUpdate().data).toEqual({ carrier: 'DHL' });
    });

    it('notes when the pharmacy is ready, and never records a time in the future', async () => {
      await tracking.applyTracking('o-1', event({ status: 'READY_FOR_PICKUP', occurredAt: new Date(Date.now() + 86_400_000 * 5) }));
      const recorded = prisma.orderTrackingEvent.create.mock.calls[0][0].data.occurredAt as Date;
      expect(recorded.getTime()).toBeLessThanOrEqual(Date.now());
      expect(lastUpdate().data).toEqual({ readyForPickupAt: recorded });
    });

    it('does not tell the patient anything when someone else moved the order first', async () => {
      prisma.order.updateMany.mockResolvedValue({ count: 0 });
      await tracking.applyTracking('o-1', event());
      expect(email.sendOrderUpdateEmail).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('reportCannotFulfil (the pharmacy can’t supply an order)', () => {
    beforeEach(() => { prisma.orderTrackingEvent = { create: jest.fn().mockResolvedValue({}) }; });

    it('flags the order as a problem for our team, with the pharmacy’s reason, and cancels nothing', async () => {
      await service.reportCannotFulfil('prov-1', 'o-1', '  Out of stock until next week  ');
      expect(prisma.orderTrackingEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: 'o-1', status: 'CANNOT_FULFIL', note: 'Out of stock until next week', source: 'MANUAL' }) });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORDER_PHARMACY_CANNOT_FULFIL', metadata: { reason: 'Out of stock until next week' } }));
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('needs a reason, kept to a sensible length', async () => {
      await expect(service.reportCannotFulfil('prov-1', 'o-1', '   ')).rejects.toThrow(/why/);
      await expect(service.reportCannotFulfil('prov-1', 'o-1', 'x'.repeat(501))).rejects.toThrow(/500/);
      expect(prisma.orderTrackingEvent.create).not.toHaveBeenCalled();
    });

    it('is only for an order that has not been shipped', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o-1', status: 'DISPATCHED', patient: PATIENT, prescription: ACTIVE_RX });
      await expect(service.reportCannotFulfil('prov-1', 'o-1', 'Out of stock')).rejects.toThrow(/hasn’t been shipped/);
    });

    it('does not hide a failure to record the report', async () => {
      prisma.orderTrackingEvent.create.mockRejectedValue(new Error('db down'));
      await expect(service.reportCannotFulfil('prov-1', 'o-1', 'Out of stock')).rejects.toThrow('db down');
    });
  });

  describe('handOver (the pharmacy says the courier has collected the parcel)', () => {
    let email: { sendOrderUpdateEmail: jest.Mock };
    let withEmail: OrdersService;
    const pending = (over: object = {}) => ({ id: 'o-1', status: 'PENDING', patient: { ...PATIENT, email: 'p@example.com', firstName: 'Emma' }, prescription: ACTIVE_RX, readyForPickupAt: null, carrier: null, trackingNumber: null, trackingUrl: null, estimatedDeliveryFrom: null, estimatedDeliveryTo: null, ...over });
    beforeEach(() => {
      email = { sendOrderUpdateEmail: jest.fn().mockResolvedValue(undefined) };
      withEmail = new OrdersService(prisma, audit as any, trtMonitoring as any, partner as any, { get: () => undefined } as any, email as any);
      prisma.orderTrackingEvent = { create: jest.fn().mockResolvedValue({}) };
      prisma.order.findUnique.mockResolvedValue(pending());
    });

    it('ships the order with no courier, tracking or address from the pharmacy, and tells the patient', async () => {
      await withEmail.handOver('prov-1', 'o-1');
      const data = prisma.order.updateMany.mock.calls.find((c: any) => c[0].data.status === 'DISPATCHED')[0].data;
      expect(data).toMatchObject({ status: 'DISPATCHED', dispatchedAt: expect.any(Date), carrier: null, trackingNumber: null, trackingUrl: null });
      expect(data.shippingAddress).toEqual(expect.objectContaining({ city: 'Prishtinë' })); // the patient's own address, snapshotted by us
      expect(prisma.orderTrackingEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: 'o-1', status: 'PICKED_UP', source: 'MANUAL' }) });
      expect(email.sendOrderUpdateEmail).toHaveBeenCalledWith('p@example.com', 'Emma', 'SHIPPED', expect.anything());
    });

    it('notes that it was ready for pickup if the pharmacy never pressed that', async () => {
      await withEmail.handOver('prov-1', 'o-1');
      expect(prisma.order.updateMany).toHaveBeenCalledWith({ where: { id: 'o-1', readyForPickupAt: null }, data: { readyForPickupAt: expect.any(Date) } });
    });

    it('is only for an order that has not been shipped', async () => {
      prisma.order.findUnique.mockResolvedValue(pending({ status: 'DISPATCHED' }));
      await expect(withEmail.handOver('prov-1', 'o-1')).rejects.toThrow(/hasn’t been shipped/);
      expect(email.sendOrderUpdateEmail).not.toHaveBeenCalled();
    });

    it('still refuses an expired prescription or a missing address, like any dispatch', async () => {
      prisma.order.findUnique.mockResolvedValue(pending({ prescription: { ...ACTIVE_RX, validUntil: new Date(Date.now() - 1000) } }));
      await expect(withEmail.handOver('prov-1', 'o-1')).rejects.toThrow(/expired/);
      prisma.order.findUnique.mockResolvedValue(pending({ patient: { ...PATIENT, addressLine1: null } }));
      await expect(withEmail.handOver('prov-1', 'o-1')).rejects.toThrow(/delivery address/);
    });
  });

  describe('cancel (and what happens to the patient’s money)', () => {
    let billing: { cancelAndRefund: jest.Mock; refundLatestPayment: jest.Mock; cancelAtPeriodEnd: jest.Mock };
    let withBilling: OrdersService;
    beforeEach(() => {
      billing = {
        cancelAndRefund: jest.fn().mockResolvedValue({ status: 'REFUNDED', subscriptionId: 'sub_1', refundId: 're_1' }),
        refundLatestPayment: jest.fn().mockResolvedValue('Refunded the latest payment (re_2)'),
        cancelAtPeriodEnd: jest.fn().mockResolvedValue('Subscription cancels at the end of the current period'),
      };
      withBilling = new OrdersService(prisma, audit as any, trtMonitoring as any, partner as any, { get: () => undefined } as any, undefined, billing as any);
      prisma.order.update = jest.fn().mockResolvedValue({});
    });

    it('cancels the order and touches no money unless asked', async () => {
      await withBilling.cancel('admin-1', 'o-1', 'Patient asked');
      expect(prisma.order.updateMany).toHaveBeenCalledWith({ where: { id: 'o-1', status: 'PENDING' }, data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'Patient asked' }) });
      expect(billing.cancelAndRefund).not.toHaveBeenCalled();
      expect(billing.refundLatestPayment).not.toHaveBeenCalled();
      expect(billing.cancelAtPeriodEnd).not.toHaveBeenCalled();
    });

    it('with both ticked ends the subscription and refunds, as a declined consultation does, and records it', async () => {
      await withBilling.cancel('admin-1', 'o-1', 'Out of stock', { refund: true, endSubscription: true });
      expect(billing.cancelAndRefund).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Emma' }));
      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'o-1' }, data: { cancelBillingNote: 'Subscription ended and the latest payment refunded (re_1)' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORDER_CANCELLED', metadata: expect.objectContaining({ refund: true, endSubscription: true }) }));
    });

    it('refund only leaves the subscription running; end only lets the paid period finish', async () => {
      await withBilling.cancel('admin-1', 'o-1', 'Out of stock', { refund: true });
      expect(billing.refundLatestPayment).toHaveBeenCalled();
      expect(billing.cancelAndRefund).not.toHaveBeenCalled();
      await withBilling.cancel('admin-1', 'o-1', 'Patient left', { endSubscription: true });
      expect(billing.cancelAtPeriodEnd).toHaveBeenCalled();
    });

    it('keeps the order cancelled and writes the problem down when billing fails', async () => {
      billing.cancelAndRefund.mockResolvedValue({ status: 'FAILED', error: 'Stripe is down' });
      await withBilling.cancel('admin-1', 'o-1', 'Out of stock', { refund: true, endSubscription: true });
      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'o-1' }, data: { cancelBillingNote: expect.stringContaining('fix it in Stripe by hand') } });
    });

    it('still needs a reason', async () => {
      await expect(withBilling.cancel('admin-1', 'o-1', '  ', { refund: true })).rejects.toThrow(/reason/);
      expect(billing.refundLatestPayment).not.toHaveBeenCalled();
    });
  });

  describe('markReadyForPickup', () => {
    beforeEach(() => { prisma.orderTrackingEvent = { create: jest.fn().mockResolvedValue({}) }; prisma.order.update = jest.fn().mockResolvedValue({}); });

    it('notes that the pharmacy has packed it, once, and records the step', async () => {
      await service.markReadyForPickup('prov-1', 'o-1');
      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'o-1' }, data: { readyForPickupAt: expect.any(Date) } });
      expect(prisma.orderTrackingEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: 'o-1', status: 'READY_FOR_PICKUP', source: 'MANUAL' }) });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORDER_READY_FOR_PICKUP' }));
    });

    it('is only for an order still being prepared, with a delivery address', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o-1', status: 'DISPATCHED', patient: PATIENT, prescription: ACTIVE_RX });
      await expect(service.markReadyForPickup('prov-1', 'o-1')).rejects.toThrow(/still being prepared/);
      prisma.order.findUnique.mockResolvedValue({ id: 'o-1', status: 'PENDING', patient: { ...PATIENT, addressLine1: null }, prescription: ACTIVE_RX });
      await expect(service.markReadyForPickup('prov-1', 'o-1')).rejects.toThrow(/delivery address/);
    });
  });

  describe('dispatch', () => {
    it('moves a pending order to dispatched and snapshots the address', async () => {
      await service.dispatch('prov-1', 'o-1', ' PH-9 ');
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'o-1', status: 'PENDING' },
        data: expect.objectContaining({
          status: 'DISPATCHED',
          pharmacyRef: 'PH-9',
          shippingAddress: expect.objectContaining({ name: 'Emma White', city: 'Prishtinë' }),
        }),
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORDER_DISPATCHED' }));
    });

    it.each([
      ['cancelled', { ...ACTIVE_RX, status: 'CANCELLED' }, /cancelled and can’t be dispensed/],
      ['expired', { ...ACTIVE_RX, validUntil: new Date(Date.now() - 1000) }, /expired/],
    ])('refuses a %s prescription', async (_name, prescription, message) => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o-1', status: 'PENDING', patient: PATIENT, prescription });
      await expect(service.dispatch('prov-1', 'o-1', 'PH-9')).rejects.toThrow(message);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('refuses without a delivery address', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o-1', status: 'PENDING', patient: { ...PATIENT, postcode: null }, prescription: ACTIVE_RX });
      await expect(service.dispatch('prov-1', 'o-1', 'PH-9')).rejects.toThrow(/delivery address/);
    });

    it('reports an order that already moved on', async () => {
      prisma.order.updateMany.mockResolvedValue({ count: 0 });
      prisma.order.findUnique
        .mockResolvedValueOnce({ id: 'o-1', status: 'PENDING', patient: PATIENT, prescription: ACTIVE_RX })
        .mockResolvedValueOnce({ id: 'o-1', status: 'DISPATCHED' });
      await expect(service.dispatch('prov-1', 'o-1', 'PH-9')).rejects.toThrow('The order is dispatched, not pending');
    });
  });

  it('only marks delivered from out-for-delivery', async () => {
    await service.markDelivered('prov-1', 'o-1');
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o-1', status: 'OUT_FOR_DELIVERY' },
      data: expect.objectContaining({ status: 'DELIVERED' }),
    });
  });

  describe('createRepeat', () => {
    const withOrders = (orders: Array<{ status: string; sequence: number }>, rx = ACTIVE_RX) =>
      prisma.prescription.findUnique.mockResolvedValue({ ...rx, orders });

    it('creates the next supply while repeats remain', async () => {
      withOrders([{ status: 'DELIVERED', sequence: 1 }]);
      await service.createRepeat('doc-1', 'rx-1');
      expect(prisma.order.create).toHaveBeenCalledWith({ data: { prescriptionId: 'rx-1', patientId: 'p-1', sequence: 2 } });
    });

    it('closes the patient’s open refill request once the order is placed', async () => {
      withOrders([{ status: 'DELIVERED', sequence: 1 }]);
      await service.createRepeat('doc-1', 'rx-1');
      expect(prisma.refillRequest.updateMany).toHaveBeenCalledWith({
        where: { prescriptionId: 'rx-1', resolvedAt: null },
        data: { resolvedAt: expect.any(Date), orderId: 'o-new' },
      });
    });

    it('does not count cancelled orders against the repeats', async () => {
      withOrders([{ status: 'DELIVERED', sequence: 1 }, { status: 'CANCELLED', sequence: 2 }, { status: 'DELIVERED', sequence: 3 }]);
      await service.createRepeat('doc-1', 'rx-1');
      expect(prisma.order.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sequence: 4 }) });
    });

    it('refuses once all repeats are used', async () => {
      withOrders([1, 2, 3].map((sequence) => ({ status: 'DELIVERED', sequence })));
      await expect(service.createRepeat('doc-1', 'rx-1')).rejects.toThrow(/All repeats/);
    });

    it('refuses while another order is still pending', async () => {
      withOrders([{ status: 'PENDING', sequence: 1 }]);
      await expect(service.createRepeat('doc-1', 'rx-1')).rejects.toThrow(/already an order waiting/);
    });

    it('refuses a repeat once the patient’s subscription has ended', async () => {
      prisma.prescription.findUnique.mockResolvedValue({
        ...ACTIVE_RX, orders: [{ status: 'DELIVERED', sequence: 1 }], patient: { subscriptionEndedAt: new Date() },
      });
      await expect(service.createRepeat('doc-1', 'rx-1')).rejects.toThrow(/subscription has ended/);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('refuses a testosterone repeat while its blood tests are on hold', async () => {
      withOrders([{ status: 'DELIVERED', sequence: 1 }]);
      trtMonitoring.assertRepeatAllowed.mockRejectedValue(new Error('Testosterone repeat on hold: PSA test overdue'));
      await expect(service.createRepeat('doc-1', 'rx-1')).rejects.toThrow(/on hold/);
      expect(trtMonitoring.assertRepeatAllowed).toHaveBeenCalledWith('rx-1', prisma);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });
  });
});

describe('OrdersService cancelling', () => {
  let prisma: any;
  let partner: { trySend: jest.Mock; markCancelled: jest.Mock; flushCancellations: jest.Mock };
  let service: OrdersService;

  beforeEach(() => {
    prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ id: 'o-1', status: 'CANCELLED', patient: PATIENT, prescription: ACTIVE_RX }),
        findMany: jest.fn().mockResolvedValue([{ id: 'o-1' }, { id: 'o-2' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    partner = { trySend: jest.fn(), markCancelled: jest.fn(), flushCancellations: jest.fn() };
    service = new OrdersService(prisma, { log: jest.fn() } as any, {} as any, partner as any);
  });

  it('cancel() tells the pharmacy partner the order is withdrawn, after it is saved', async () => {
    await service.cancel('doc-1', 'o-1', ' Wrong dose ');
    expect(prisma.order.updateMany).toHaveBeenCalledWith({ where: { id: 'o-1', status: 'PENDING' }, data: expect.objectContaining({ status: 'CANCELLED' }) });
    expect(partner.markCancelled).toHaveBeenCalledWith(['o-1']);
    expect(partner.flushCancellations).toHaveBeenCalled();
    expect(partner.markCancelled.mock.invocationCallOrder[0]).toBeGreaterThan(prisma.order.updateMany.mock.invocationCallOrder[0]);
  });

  it('cancel() tells nobody when the order was not cancellable', async () => {
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancel('doc-1', 'o-1', 'x')).rejects.toThrow();
    expect(partner.markCancelled).not.toHaveBeenCalled();
  });

  it('cancelPendingFor() queues a cancellation for every pending order it stops, in the same transaction', async () => {
    const tx: any = { order: { findMany: prisma.order.findMany, updateMany: prisma.order.updateMany } };
    await service.cancelPendingFor('rx-1', 'Superseded by a new prescription', tx);
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['o-1', 'o-2'] }, status: 'PENDING' },
      data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'Superseded by a new prescription' }),
    });
    expect(partner.markCancelled).toHaveBeenCalledWith(['o-1', 'o-2'], tx);
    // inside a caller's transaction nothing is sent yet — it isn't committed
    expect(partner.flushCancellations).not.toHaveBeenCalled();
  });

  it('cancelPendingFor() outside a transaction sends straight away', async () => {
    await service.cancelPendingFor('rx-1', 'x');
    expect(partner.flushCancellations).toHaveBeenCalled();
  });

  it('a patient\'s own orders carry no partner delivery details', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await service.findOwn('p-1');
    const include = prisma.order.findMany.mock.calls[0][0].include;
    expect(include).not.toHaveProperty('partnerTransmission');
    await service.findByPatient('p-1');
    expect(prisma.order.findMany.mock.calls[1][0].include.partnerTransmission.select).not.toHaveProperty('payload');
  });
});

describe('deliveryAddressOf', () => {
  it('needs line 1, city, postcode and country', () => {
    expect(deliveryAddressOf(PATIENT)).toMatchObject({ name: 'Emma White', country: 'Kosovo' });
    expect(deliveryAddressOf({ ...PATIENT, city: null })).toBeNull();
  });
});
