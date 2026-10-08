import { RefundRequestsService } from './refund-requests.service';

function setup(over: { claimed?: number; refund?: () => Promise<string> } = {}) {
  const rows: any = { id: 'r-1', patientId: 'p-1', status: 'REQUESTED' };
  const prisma: any = {
    refundRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(rows),
      create: jest.fn().mockResolvedValue(rows),
      updateMany: jest.fn().mockResolvedValue({ count: over.claimed ?? 1 }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...rows, ...data })),
    },
    patient: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'p-1', email: 'a@x', stripeCustomerId: null, stripeSubscriptionId: 's' }) },
  };
  const audit = { log: jest.fn() };
  const billing = {
    refundLatestPayment: jest.fn(over.refund ?? (async () => 'Refunded the latest payment (re_1)')),
    cancelAtPeriodEnd: jest.fn().mockResolvedValue('Subscription cancels at the end of the current period'),
  };
  return { service: new RefundRequestsService(prisma, audit as any, billing as any), prisma, audit, billing };
}

describe('RefundRequestsService', () => {
  it('opens a request without any reason, and moves no money', async () => {
    const { service, prisma, billing } = setup();
    await service.request('p-1');
    expect(prisma.refundRequest.create).toHaveBeenCalledWith({ data: { patientId: 'p-1' } });
    expect(billing.refundLatestPayment).not.toHaveBeenCalled();
  });

  it('returns the request already open instead of making a second', async () => {
    const { service, prisma } = setup();
    prisma.refundRequest.findFirst.mockResolvedValue({ id: 'r-0' });
    expect(await service.request('p-1')).toEqual({ id: 'r-0' });
    expect(prisma.refundRequest.create).not.toHaveBeenCalled();
  });

  it('refunds only when an admin approves, and can end the subscription too', async () => {
    const { service, billing, prisma } = setup();
    const done = await service.decide('admin', 'r-1', true, true);
    expect(billing.refundLatestPayment).toHaveBeenCalledTimes(1);
    expect(billing.cancelAtPeriodEnd).toHaveBeenCalledTimes(1);
    expect(prisma.refundRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }));
    expect(done.outcome).toContain('Refunded');
  });

  it('declining refunds nothing', async () => {
    const { service, billing, prisma } = setup();
    await service.decide('admin', 'r-1', false, false);
    expect(prisma.refundRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DECLINED' }) }));
    expect(billing.refundLatestPayment).not.toHaveBeenCalled();
  });

  it('does not refund twice when two admins press at once', async () => {
    const { service, billing } = setup({ claimed: 0 });
    await expect(service.decide('admin', 'r-1', true, false)).rejects.toThrow('already been decided');
    expect(billing.refundLatestPayment).not.toHaveBeenCalled();
  });

  it('puts the request back when Stripe fails, so it can be tried again', async () => {
    const { service, prisma } = setup({ refund: async () => { throw new Error('Stripe down'); } });
    await expect(service.decide('admin', 'r-1', true, false)).rejects.toThrow('Stripe down');
    expect(prisma.refundRequest.update).toHaveBeenCalledWith({ where: { id: 'r-1' }, data: expect.objectContaining({ status: 'REQUESTED' }) });
  });
});
