import { OrdersService } from './orders.service';

function setup() {
  const prisma: any = { order: { findMany: jest.fn().mockResolvedValue([]) } };
  const service = new OrdersService(prisma, { log: jest.fn() } as any, {} as any, {} as any);
  const where = () => prisma.order.findMany.mock.lastCall[0].where;
  return { service, where };
}

describe('OrdersService.findAll', () => {
  it('without a search holds open orders and recently finished ones only', async () => {
    const { service, where } = setup();
    await service.findAll();
    const or = where().AND[0].OR;
    expect(or[0]).toEqual({ status: { in: ['PENDING', 'DISPATCHED', 'OUT_FOR_DELIVERY'] } });
    expect(or.length).toBe(4);
  });

  it('with a search looks through everything, every word matching somewhere', async () => {
    const { service, where } = setup();
    await service.findAll(undefined, 'emma white');
    expect(where().AND).toHaveLength(2);
    expect(JSON.stringify(where())).not.toContain('createdAt');
  });

  it('finds a parcel code with or without TH-', async () => {
    const { service, where } = setup();
    await service.findAll(undefined, 'TH-QEN6JGA5');
    expect(JSON.stringify(where())).toContain('"endsWith":"qen6jga5"');
  });

  it('leaves email and phone out of the search for the pharmacy', async () => {
    const { service, where } = setup();
    await service.findAll(undefined, 'emma', false);
    expect(JSON.stringify(where())).not.toMatch(/email|phone/);
    await service.findAll(undefined, 'emma', true);
    expect(JSON.stringify(where())).toMatch(/email/);
  });
});

describe('OrdersService.statementOrders', () => {
  const build = (orders: any[]) => {
    const prisma: any = { order: { findMany: jest.fn().mockResolvedValue(orders) } };
    return new OrdersService(prisma, { log: jest.fn() } as any, {} as any, {} as any);
  };
  const item = (cost: string | null) => ({ quantity: 1, product: { name: 'Ozempic', brandName: null }, strength: { label: '0.5 mg', pharmacyUnitCost: cost } });

  it('uses the cost recorded when the order was handed over, not today’s cost', async () => {
    const snapshot = [{ product: 'Ozempic', strength: '0.5 mg', quantity: 1, unitCost: 80 }];
    const [row] = await build([{ id: 'o-1', sequence: 1, dispatchedAt: new Date(), pharmacyCostSnapshot: snapshot, prescription: { items: [item('95')] } }]).statementOrders(2026, 10);
    expect(row.items[0].unitCost).toBe(80);
  });

  it('falls back to today’s cost only for an order handed over before costs were recorded', async () => {
    const [row] = await build([{ id: 'o-1', sequence: 1, dispatchedAt: new Date(), pharmacyCostSnapshot: null, prescription: { items: [item('95')] } }]).statementOrders(2026, 10);
    expect(row.items[0].unitCost).toBe(95);
  });
});
