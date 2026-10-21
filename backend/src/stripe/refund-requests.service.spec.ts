import { RefundRequestsService } from './refund-requests.service';

function setup(over: { claimed?: number; refund?: () => Promise<{ ok: boolean; note: string }>; stop?: { ok: boolean; note: string }; stopped?: number; prescribedAt?: Date | null; received?: number } = {}) {
  const rows: any = { id: 'r-1', patientId: 'p-1', status: 'REQUESTED' };
  const prisma: any = {
    refundRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(rows),
      create: jest.fn().mockResolvedValue(rows),
      updateMany: jest.fn().mockResolvedValue({ count: over.claimed ?? 1 }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...rows, ...data })),
    },
    patient: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'p-1', email: 'a@x', stripeCustomerId: null, stripeSubscriptionId: 's' }), findUnique: jest.fn().mockResolvedValue({ firstName: 'A', lastName: 'B' }) },
  };
  prisma.prescription = { findFirst: jest.fn().mockResolvedValue(over.prescribedAt === undefined ? null : { issuedAt: over.prescribedAt }) };
  const audit = { log: jest.fn() };
  const billing = {
    refundLatestPaymentResult: jest.fn(over.refund ?? (async () => ({ ok: true, note: 'Refunded the latest payment (re_1)' }))),
    cancelNowResult: jest.fn().mockResolvedValue(over.stop ?? { ok: true, note: 'Subscription ended now' }),
    cancelAtPeriodEndResult: jest.fn().mockResolvedValue(over.stop ?? { ok: true, note: 'Subscription cancels at the end of the current period' }),
  };
  const notifier = { toPatient: jest.fn(), toStaff: jest.fn(), resolve: jest.fn() };
  prisma.order = { findFirst: jest.fn().mockResolvedValue({ id: 'o-ship' }), count: jest.fn().mockResolvedValue(over.received ?? 1) };
  prisma.refundRequest.findMany = jest.fn().mockResolvedValue([]);
  prisma.refundRequest.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: 'r-1', status: 'AWAITING_RETURN' });
  const email = { sendRefundAwaitingReturnEmail: jest.fn().mockResolvedValue(undefined) };
  const orders = { cancelUnshippedFor: jest.fn().mockResolvedValue(over.stopped ?? 1) , offerReturn: jest.fn().mockResolvedValue(null) };
  const referrals = { applyAllFor: jest.fn().mockResolvedValue(0) };
  const moduleRef = { get: jest.fn((token: { name?: string }) => (token?.name === 'ReferralsService' ? referrals : orders)) };
  prisma.consultation = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
  return { service: new RefundRequestsService(prisma, audit as any, billing as any, notifier as any, moduleRef as any, email as any), prisma, audit, billing, notifier, orders, email, referrals };
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
    expect(billing.cancelNowResult).toHaveBeenCalledTimes(1);
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

  it('with the subscription ended, the patient is marked as ended and what has not shipped is cancelled', async () => {
    const { service, prisma, orders } = setup({ stopped: 2 });
    const done = await service.decide('admin', 'r-1', true, true);
    expect(prisma.patient.updateMany).toHaveBeenCalledWith({ where: { id: 'p-1', subscriptionEndedAt: null }, data: { subscriptionEndedAt: expect.any(Date) } });
    expect(orders.cancelUnshippedFor).toHaveBeenCalledWith('p-1', expect.stringContaining('Refunded'));
    expect(done.outcome).toContain('2 orders not yet shipped cancelled');
  });

  it('closes access when nothing was ever received, and offers the prescription again', async () => {
    const { service, prisma, orders } = setup({ received: 0 });
    orders.offerReturn = jest.fn().mockResolvedValue({ orderId: 'o-2', until: new Date('2030-01-01') });
    const done = await service.decide('admin', 'r-1', true, true);
    expect(prisma.patient.update).toHaveBeenCalledWith({ where: { id: 'p-1' }, data: expect.objectContaining({ accessClosedReason: 'REFUNDED_FIRST_ORDER', tokenVersion: { increment: 1 } }) });
    expect(orders.offerReturn).toHaveBeenCalledWith('p-1');
    expect(done.outcome).toContain('Access closed');
  });

  it('applies their vouchers and closes what was waiting for a doctor, before offering the prescription again', async () => {
    const { service, prisma, referrals, orders } = setup({ received: 0 });
    orders.offerReturn.mockResolvedValue({ orderId: 'o-2', until: new Date('2030-01-01') });
    await service.decide('admin', 'r-1', true, true);
    expect(referrals.applyAllFor).toHaveBeenCalledWith('p-1');
    expect(prisma.consultation.updateMany).toHaveBeenCalledWith({ where: { patientId: 'p-1', status: { in: ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'] } }, data: expect.objectContaining({ status: 'DECLINED', refundStatus: 'REFUNDED' }) });
    expect(referrals.applyAllFor.mock.invocationCallOrder[0]).toBeLessThan(orders.offerReturn.mock.invocationCallOrder[0]);
  });

  it('leaves vouchers and consultations alone when a supply was received', async () => {
    const { service, prisma, referrals } = setup({ received: 1 });
    await service.decide('admin', 'r-1', true, true);
    expect(referrals.applyAllFor).not.toHaveBeenCalled();
    expect(prisma.consultation.updateMany).not.toHaveBeenCalled();
  });

  it('keeps access when a supply was received', async () => {
    const { service, prisma } = setup({ received: 1 });
    await service.decide('admin', 'r-1', true, true);
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });

  it('leaves the subscription and the supplies alone when the admin did not end it', async () => {
    const { service, prisma, orders, billing } = setup();
    await service.decide('admin', 'r-1', true, false);
    expect(billing.cancelNowResult).not.toHaveBeenCalled();
    expect(prisma.patient.updateMany).not.toHaveBeenCalled();
    expect(orders.cancelUnshippedFor).not.toHaveBeenCalled();
  });

  it('does not mark the patient ended when Stripe could not end the subscription', async () => {
    const { service, prisma, orders } = setup({ stop: { ok: false, note: 'Billing update failed' } });
    await service.decide('admin', 'r-1', true, true);
    expect(prisma.patient.updateMany).not.toHaveBeenCalled();
    expect(orders.cancelUnshippedFor).not.toHaveBeenCalled();
  });
});

describe('a refund that waits for the parcel to come back', () => {
  it('waits when the parcel is with the courier: the patient is told not to open it, and no money moves', async () => {
    const { service, prisma, billing, notifier, email } = setup();
    await service.waitForReturn('admin', 'r-1', true);
    expect(prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'p-1', status: { in: ['DISPATCHED', 'OUT_FOR_DELIVERY'] } } }));
    expect(prisma.refundRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'r-1', status: 'REQUESTED' }, data: expect.objectContaining({ status: 'AWAITING_RETURN', awaitingOrderId: 'o-ship', awaitingEndSubscription: true }) });
    expect(notifier.toPatient).toHaveBeenCalledWith('p-1', expect.objectContaining({ kind: 'REFUND_AWAITING_RETURN' }));
    expect(email.sendRefundAwaitingReturnEmail).toHaveBeenCalled();
    expect(billing.refundLatestPaymentResult).not.toHaveBeenCalled();
  });

  it('has nothing to wait for when no parcel is with the courier', async () => {
    const { service, prisma, billing } = setup();
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(service.waitForReturn('admin', 'r-1', true)).rejects.toThrow(/nothing to wait for/);
    expect(billing.refundLatestPaymentResult).not.toHaveBeenCalled();
  });

  it('pays the refund once the parcel is reported back, ending the subscription as chosen', async () => {
    const { service, prisma, billing } = setup();
    const waiting = { id: 'r-1', patientId: 'p-1', status: 'AWAITING_RETURN', awaitingOrderId: 'o-ship', awaitingEndSubscription: true, decidedById: 'admin' };
    prisma.refundRequest.findMany.mockResolvedValue([waiting]);
    prisma.refundRequest.findUnique.mockResolvedValue(waiting);
    await service.onParcelReturned('o-ship');
    expect(prisma.refundRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'r-1', status: 'AWAITING_RETURN' }, data: expect.objectContaining({ status: 'APPROVED' }) });
    expect(billing.refundLatestPaymentResult).toHaveBeenCalledTimes(1);
    expect(billing.cancelNowResult).toHaveBeenCalledTimes(1);
  });

  it('leaves the subscription running after a return when the admin did not choose to end it', async () => {
    const { service, prisma, billing } = setup();
    const waiting = { id: 'r-1', patientId: 'p-1', status: 'AWAITING_RETURN', awaitingOrderId: 'o-ship', awaitingEndSubscription: false, decidedById: 'admin' };
    prisma.refundRequest.findMany.mockResolvedValue([waiting]);
    prisma.refundRequest.findUnique.mockResolvedValue(waiting);
    await service.onParcelReturned('o-ship');
    expect(billing.refundLatestPaymentResult).toHaveBeenCalledTimes(1);
    expect(billing.cancelNowResult).not.toHaveBeenCalled();
  });

  it('keeps waiting, and asks an admin, when the refund cannot be made after the return', async () => {
    const { service, prisma, notifier } = setup({ refund: async () => ({ ok: false, note: 'Stripe is down' }) });
    const waiting = { id: 'r-1', patientId: 'p-1', status: 'AWAITING_RETURN', awaitingOrderId: 'o-ship', awaitingEndSubscription: true, decidedById: 'admin' };
    prisma.refundRequest.findMany.mockResolvedValue([waiting]);
    prisma.refundRequest.findUnique.mockResolvedValue(waiting);
    await service.onParcelReturned('o-ship');
    expect(prisma.refundRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'r-1', status: 'AWAITING_RETURN' }, data: expect.objectContaining({ status: 'REQUESTED', awaitingOrderId: null }) });
    expect(notifier.toStaff).toHaveBeenCalled();
  });

  it('goes back to an admin to decide when the parcel was delivered after all', async () => {
    const { service, prisma, notifier, billing } = setup();
    prisma.refundRequest.findMany.mockResolvedValue([{ id: 'r-1', patientId: 'p-1', status: 'AWAITING_RETURN', awaitingOrderId: 'o-ship' }]);
    await service.onParcelDelivered('o-ship');
    expect(prisma.refundRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'r-1', status: 'AWAITING_RETURN' }, data: expect.objectContaining({ status: 'REQUESTED', outcome: 'The parcel was delivered' }) });
    expect(notifier.toStaff).toHaveBeenCalled();
    expect(billing.refundLatestPaymentResult).not.toHaveBeenCalled();
  });

  it('lets an admin refund anyway, or decline, while it waits', async () => {
    const { service, prisma, billing } = setup();
    prisma.refundRequest.findUnique.mockResolvedValue({ id: 'r-1', patientId: 'p-1', status: 'AWAITING_RETURN' });
    await service.decide('admin', 'r-1', true, true);
    expect(prisma.refundRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'r-1', status: 'AWAITING_RETURN' }, data: expect.objectContaining({ status: 'APPROVED' }) });
    expect(billing.refundLatestPaymentResult).toHaveBeenCalledTimes(1);
  });

  it('counts a request waiting for its parcel as open, so a second one cannot be started', async () => {
    const { service, prisma } = setup();
    prisma.refundRequest.findFirst.mockResolvedValue({ id: 'r-0', status: 'AWAITING_RETURN' });
    expect(await service.request('p-1')).toMatchObject({ id: 'r-0' });
    expect(prisma.refundRequest.findFirst).toHaveBeenCalledWith({ where: { patientId: 'p-1', status: { in: ['REQUESTED', 'AWAITING_RETURN'] } } });
  });

  it('refunds everything when no prescription was written, and leaves the prescription fee out once one was', async () => {
    const none = setup();
    await none.service.decide('admin', 'r-1', true, false);
    expect(none.billing.refundLatestPaymentResult).toHaveBeenCalledWith(expect.anything(), { prescriptionIssuedAt: null });
    const issued = new Date('2026-10-20T10:00:00Z');
    const written = setup({ prescribedAt: issued });
    await written.service.decide('admin', 'r-1', true, false);
    expect(written.billing.refundLatestPaymentResult).toHaveBeenCalledWith(expect.anything(), { prescriptionIssuedAt: issued });
  });
});
