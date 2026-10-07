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
