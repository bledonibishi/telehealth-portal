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

  beforeEach(() => {
    prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ id: 'o-1', status: 'PENDING', patient: PATIENT, prescription: ACTIVE_RX }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'o-new' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'o-new', ...data })),
      },
      prescription: { findUnique: jest.fn() },
    };
    audit = { log: jest.fn() };
    service = new OrdersService(prisma, audit as any);
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
  });
});

describe('deliveryAddressOf', () => {
  it('needs line 1, city, postcode and country', () => {
    expect(deliveryAddressOf(PATIENT)).toMatchObject({ name: 'Emma White', country: 'Kosovo' });
    expect(deliveryAddressOf({ ...PATIENT, city: null })).toBeNull();
  });
});
