import { RefundRequestsService } from './refund-requests.service';

function setup(over: { claimed?: number; refund?: () => Promise<{ ok: boolean; note: string }>; stop?: { ok: boolean; note: string } } = {}) {
  const rows: any = { id: 'r-1', patientId: 'p-1', status: 'REQUESTED' };
  const prisma: any = {
    refundRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(rows),
      create: jest.fn().mockResolvedValue(rows),
      updateMany: jest.fn().mockResolvedValue({ count: over.claimed ?? 1 }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...rows, ...data })),
    },
    patient: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'p-1', email: 'a@x', stripeCustomerId: null, stripeSubscriptionId: 's' }), findUnique: jest.fn().mockResolvedValue({ firstName: 'A', lastName: 'B' }) },
  };
  const audit = { log: jest.fn() };
  const billing = {
    refundLatestPaymentResult: jest.fn(over.refund ?? (async () => ({ ok: true, note: 'Refunded the latest payment (re_1)' }))),
    cancelAtPeriodEndResult: jest.fn().mockResolvedValue(over.stop ?? { ok: true, note: 'Subscription cancels at the end of the current period' }),
  };
  const notifier = { toPatient: jest.fn(), toStaff: jest.fn(), resolve: jest.fn() };
  return { service: new RefundRequestsService(prisma, audit as any, billing as any, notifier as any), prisma, audit, billing, notifier };
}

describe('RefundRequestsService', () => {
  it('opens a request without any reason, and moves no money', async () => {
    const { service, prisma, billing } = setup();
    await service.request('p-1');
    expect(prisma.refundRequest.create).toHaveBeenCalledWith({ data: { patientId: 'p-1' } });
    expect(billing.refundLatestPaymentResult).not.toHaveBeenCalled();
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
    expect(billing.refundLatestPaymentResult).toHaveBeenCalledTimes(1);
    expect(billing.cancelAtPeriodEndResult).toHaveBeenCalledTimes(1);
    expect(prisma.refundRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }));
    expect(done.outcome).toContain('Refunded');
  });

  it('declining refunds nothing', async () => {
    const { service, billing, prisma } = setup();
    await service.decide('admin', 'r-1', false, false);
    expect(prisma.refundRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DECLINED' }) }));
    expect(billing.refundLatestPaymentResult).not.toHaveBeenCalled();
  });

  it('does not refund twice when two admins press at once', async () => {
    const { service, billing } = setup({ claimed: 0 });
    await expect(service.decide('admin', 'r-1', true, false)).rejects.toThrow('already been decided');
    expect(billing.refundLatestPaymentResult).not.toHaveBeenCalled();
  });

  it('puts the request back when Stripe fails, so it can be tried again', async () => {
    const { service, prisma } = setup({ refund: async () => { throw new Error('Stripe down'); } });
    await expect(service.decide('admin', 'r-1', true, false)).rejects.toThrow('Stripe down');
    expect(prisma.refundRequest.update).toHaveBeenCalledWith({ where: { id: 'r-1' }, data: expect.objectContaining({ status: 'REQUESTED' }) });
  });

  it('is not an approval when nothing was refunded: it stays open, and the patient is not told it was approved', async () => {
    const { service, prisma, notifier } = setup({ refund: async () => ({ ok: false, note: 'Stripe is not configured — update billing by hand' }) });
    await expect(service.decide('admin', 'r-1', true, false)).rejects.toThrow(/Nothing was refunded/);
    expect(prisma.refundRequest.update).toHaveBeenCalledWith({ where: { id: 'r-1' }, data: expect.objectContaining({ status: 'REQUESTED' }) });
    expect(notifier.toPatient).not.toHaveBeenCalled();
  });

  it('says so when the refund went through but the subscription could not be stopped', async () => {
    const { service, prisma } = setup({ stop: { ok: false, note: 'Billing update failed' } });
    await service.decide('admin', 'r-1', true, true);
    const outcome = prisma.refundRequest.update.mock.calls.find((c: any) => c[0].data.outcome)[0].data.outcome;
    expect(outcome).toMatch(/NOT stopped/);
  });

  it('returns the open request when a second tap hits the one-open-request rule', async () => {
    const { service, prisma } = setup();
    const { Prisma } = require('@prisma/client');
    prisma.refundRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'r-0' });
    prisma.refundRequest.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    expect(await service.request('p-1')).toEqual({ id: 'r-0' });
  });

  it('refuses to say a subscription was stopped when it was not', async () => {
    const { service, audit } = setup({ stop: { ok: false, note: 'Billing update failed' } });
    await expect(service.cancelSubscription('p-1')).rejects.toThrow(/couldn’t stop/);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
