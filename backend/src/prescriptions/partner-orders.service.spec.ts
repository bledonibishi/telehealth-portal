import { BadRequestException, ConflictException } from '@nestjs/common';
import { CLAIM_TTL_MS, PartnerOrdersService, retryDelayMinutes } from './partner-orders.service';

const ORDER = {
  id: 'cmorder00000001',
  sequence: 1,
  status: 'PENDING',
  createdAt: new Date('2026-10-01T10:00:00Z'),
  prescriptionId: 'rx-1',
  patient: {
    id: 'p-1', firstName: 'Emma', lastName: 'White', phone: null, dateOfBirth: new Date('1978-04-14'),
    addressLine1: 'Rruga B 1', addressLine2: null, city: 'Prishtinë', postcode: '10000', country: 'Kosovo',
  },
  prescription: {
    id: 'rx-1', status: 'ACTIVE', validUntil: new Date(Date.now() + 86_400_000), issuedAt: new Date(), refillsAllowed: 0,
    contentHash: 'h', instructions: 'x', prescriber: null,
    items: [{
      quantity: 1, directions: 'd',
      product: { name: 'P', brandName: null, category: 'GLP1', form: 'INJECTION_PEN', requiresColdChain: false },
      strength: { label: '1 mg', packDescription: null },
    }],
  },
};

/** A tiny in-memory stand-in for the partner_transmissions table, with the claim semantics the service relies on. */
function fakeTransmissions(seed?: Record<string, any>) {
  const rows = new Map<string, any>(seed ? [[seed.orderId, { event: 'order.created', targets: [], channels: [], attempts: 0, claimedAt: null, sentAt: null, status: 'PENDING', ...seed }]] : []);
  const matches = (row: any, where: any) => {
    if (where.orderId && row.orderId !== where.orderId) return false;
    if (where.event && row.event !== where.event) return false;
    if (where.claimedAt instanceof Date && row.claimedAt?.getTime() !== where.claimedAt.getTime()) return false;
    if (where.OR) {
      const ok = where.OR.some((o: any) => (o.claimedAt === null ? row.claimedAt === null : row.claimedAt !== null && row.claimedAt < o.claimedAt.lt));
      if (!ok) return false;
    }
    return true;
  };
  return {
    rows,
    findUnique: jest.fn(async ({ where }: any) => (rows.has(where.orderId) ? { ...rows.get(where.orderId) } : null)),
    findMany: jest.fn(async () => []),
    createMany: jest.fn(async ({ data }: any) => {
      for (const d of data) if (!rows.has(d.orderId)) rows.set(d.orderId, { status: 'PENDING', attempts: 0, claimedAt: null, sentAt: null, lastError: null, ...d });
      return { count: data.length };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const row = rows.get(where.orderId);
      if (!row || !matches(row, where)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      Object.assign(rows.get(where.orderId), data);
      return rows.get(where.orderId);
    }),
  };
}

function build(env: Record<string, string> = {}, over: { order?: any; transmission?: any } = {}) {
  const transmissions = fakeTransmissions(over.transmission && { orderId: ORDER.id, ...over.transmission });
  const prisma: any = {
    order: {
      findUnique: jest.fn().mockResolvedValue(over.order ?? ORDER),
      findFirst: jest.fn().mockResolvedValue({ id: ORDER.id }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    },
    partnerTransmission: transmissions,
  };
  const config = { get: jest.fn((k: string) => env[k]) };
  const email = { sendPartnerOrderEmail: jest.fn().mockResolvedValue(true) };
  const audit = { log: jest.fn() };
  const service = new PartnerOrdersService(prisma, config as any, email as any, audit as any);
  return { service, prisma, email, audit, rows: transmissions.rows };
}

const WEBHOOK = { PARTNER_WEBHOOK_URL: 'https://partner.test/hook', PARTNER_WEBHOOK_SECRET: 's3cret' };
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

describe('PartnerOrdersService', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;
  });

  it('reports which channels are set up', () => {
    expect(build().service.integrationStatus()).toMatchObject({ webhookConfigured: false, emailConfigured: false, configurationProblem: null });
    expect(build({ ...WEBHOOK, PARTNER_ORDER_EMAIL: 'a@x.com, b@x.com', PARTNER_NAME: 'PharmaCo' }).service.integrationStatus())
      .toEqual({ webhookConfigured: true, emailConfigured: true, partnerName: 'PharmaCo', configurationProblem: null });
  });

  it('refuses to send when no channel is configured', async () => {
    await expect(build().service.send(ORDER.id)).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a signed payload with an idempotency key and records SENT', async () => {
    const { service, prisma, audit } = build(WEBHOOK);
    const saved = await service.send(ORDER.id, { actorId: 'prov-1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://partner.test/hook');
    expect(init.headers['idempotency-key']).toBe(ORDER.id);
    expect(init.headers['x-telehealth-event']).toBe('order.created');
    expect(init.headers['x-telehealth-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(JSON.parse(init.body)).toMatchObject({ orderId: ORDER.id, event: 'order.created' });
    expect(saved).toMatchObject({ status: 'SENT', channels: ['WEBHOOK'], attempts: 1, lastError: null, claimedAt: null, nextAttemptAt: null });
    expect(prisma.partnerTransmission.updateMany).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORDER_SENT_TO_PARTNER', resourceId: ORDER.id }));
  });

  it('records FAILED with the reason and when to try again when the partner answers with an error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const { service, audit } = build(WEBHOOK);
    const saved = await service.send(ORDER.id);
    expect(saved).toMatchObject({ status: 'FAILED', attempts: 1, claimedAt: null });
    expect(saved.lastError).toContain('503');
    expect(saved.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000); // first back-off: 5 minutes
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORDER_PARTNER_SEND_FAILED' }));
  });

  it('retries only the channel that has not accepted the order yet', async () => {
    const { service, email } = build(
      { ...WEBHOOK, PARTNER_ORDER_EMAIL: 'ph@x.com' },
      { transmission: { status: 'FAILED', channels: ['WEBHOOK'], attempts: 1, payload: {} } },
    );
    const saved = await service.send(ORDER.id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(email.sendPartnerOrderEmail).toHaveBeenCalledTimes(1);
    expect(saved).toMatchObject({ status: 'SENT', attempts: 2 });
    expect([...saved.channels].sort()).toEqual(['EMAIL', 'WEBHOOK']);
  });

  it('treats an email provider that is not configured as a failure, not a success', async () => {
    const { service, email } = build({ PARTNER_ORDER_EMAIL: 'ph@x.com' });
    email.sendPartnerOrderEmail.mockResolvedValue(false);
    expect(await service.send(ORDER.id)).toMatchObject({ status: 'FAILED' });
  });

  it('force resends even an order that already went through', async () => {
    const { service } = build(WEBHOOK, { transmission: { status: 'SENT', channels: ['WEBHOOK'], attempts: 1, payload: {} } });
    await service.send(ORDER.id, { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('what must not be sent', () => {
    const cases: Array<[string, any, RegExp]> = [
      ['dispatched order', { ...ORDER, status: 'DISPATCHED' }, /no longer waiting/],
      ['inactive prescription', { ...ORDER, prescription: { ...ORDER.prescription, status: 'CANCELLED' } }, /no longer active/],
      ['expired prescription', { ...ORDER, prescription: { ...ORDER.prescription, validUntil: new Date('2020-01-01') } }, /expired/],
      ['missing address', { ...ORDER, patient: { ...ORDER.patient, city: null } }, /delivery address/],
    ];
    it.each(cases)('blocks a %s', async (_name, order, message) => {
      const { service } = build(WEBHOOK, { order });
      await expect(service.send(ORDER.id)).rejects.toThrow(message);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('a webhook URL without its secret', () => {
    const URL_ONLY = { PARTNER_WEBHOOK_URL: 'https://partner.test/hook' };

    it('is not a usable channel and says why', () => {
      const status = build(URL_ONLY).service.integrationStatus();
      expect(status.webhookConfigured).toBe(false);
      expect(status.configurationProblem).toMatch(/PARTNER_WEBHOOK_SECRET/);
    });

    it('never posts anything unsigned: sending is refused with the reason', async () => {
      const { service } = build(URL_ONLY);
      await expect(service.send(ORDER.id)).rejects.toThrow(/PARTNER_WEBHOOK_SECRET/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('with an email address too, the email goes out but the order stays FAILED so the gap is visible', async () => {
      const { service, email } = build({ ...URL_ONLY, PARTNER_ORDER_EMAIL: 'ph@x.com' });
      const saved = await service.send(ORDER.id);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(email.sendPartnerOrderEmail).toHaveBeenCalledTimes(1);
      expect(saved).toMatchObject({ status: 'FAILED', channels: ['EMAIL'] });
      expect(saved.lastError).toMatch(/WEBHOOK.*PARTNER_WEBHOOK_SECRET/);
    });

    it('the background sweep skips its orders instead of posting them', async () => {
      const { service, prisma } = build(URL_ONLY);
      prisma.order.findMany.mockResolvedValue([{ id: ORDER.id }]);
      expect(await service.sweep()).toEqual({ attempted: 1, sent: 0, failed: 0, skipped: 1 });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('two senders at once', () => {
    it('deliver the order only once: the second one is told it is already being sent', async () => {
      const { service, email } = build({ PARTNER_ORDER_EMAIL: 'ph@x.com' });
      const [a, b] = await Promise.allSettled([service.send(ORDER.id), service.send(ORDER.id)]);
      expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
      const rejected = [a, b].find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ConflictException);
      expect(email.sendPartnerOrderEmail).toHaveBeenCalledTimes(1);
    });

    it('counts one attempt, and lets the order be sent again later', async () => {
      const { service, rows } = build(WEBHOOK);
      await Promise.allSettled([service.send(ORDER.id), service.send(ORDER.id)]);
      expect(rows.get(ORDER.id)).toMatchObject({ attempts: 1, claimedAt: null, status: 'SENT' });
    });

    it('takes over a claim that a crashed worker left behind', async () => {
      const { service } = build(WEBHOOK, { transmission: { status: 'PENDING', claimedAt: minutesAgo(CLAIM_TTL_MS / 60_000 + 1), payload: {} } });
      expect(await service.send(ORDER.id)).toMatchObject({ status: 'SENT' });
    });

    it('leaves alone a claim that is still fresh', async () => {
      const { service } = build(WEBHOOK, { transmission: { status: 'PENDING', claimedAt: minutesAgo(0.5), payload: {} } });
      await expect(service.send(ORDER.id)).rejects.toBeInstanceOf(ConflictException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('remembers a channel that accepted the order even if a later one fails', async () => {
      const { service, email, rows } = build({ ...WEBHOOK, PARTNER_ORDER_EMAIL: 'ph@x.com' });
      email.sendPartnerOrderEmail.mockRejectedValue(new Error('smtp down'));
      await service.send(ORDER.id);
      expect(rows.get(ORDER.id)).toMatchObject({ status: 'FAILED', channels: ['WEBHOOK'] });
    });
  });

  describe('trySend', () => {
    it('does nothing when no channel is configured', async () => {
      const { service, prisma } = build();
      await service.trySend(ORDER.id);
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });

    it('skips an order the partner already has', async () => {
      const { service } = build(WEBHOOK, { transmission: { status: 'SENT', payload: {} } });
      await service.trySend(ORDER.id);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never throws, even when the partner is down', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      const { service } = build(WEBHOOK);
      await expect(service.trySend(ORDER.id)).resolves.toBeUndefined();
    });
  });

  describe('cancelling an order the partner already has', () => {
    const CANCELLED_ORDER = { id: ORDER.id, cancelledAt: new Date('2026-10-02T12:00:00Z'), cancelReason: 'Prescription cancelled: pregnant' };
    const delivered = { status: 'SENT', channels: ['WEBHOOK'], attempts: 1, sentAt: new Date(), payload: {} };

    async function cancelled(env: Record<string, string> = WEBHOOK, transmission: any = delivered) {
      const b = build(env, { order: CANCELLED_ORDER, transmission });
      await b.service.markCancelled([ORDER.id]);
      return b;
    }

    it('switches the record to a pending cancellation aimed at the channels that took the order', async () => {
      const { rows } = await cancelled({ ...WEBHOOK, PARTNER_ORDER_EMAIL: 'ph@x.com' });
      expect(rows.get(ORDER.id)).toMatchObject({ event: 'order.cancelled', status: 'PENDING', channels: [], targets: ['WEBHOOK'], attempts: 0, sentAt: null });
    });

    it('leaves orders the partner was never sent alone', async () => {
      const { rows, prisma } = await cancelled(WEBHOOK, { status: 'PENDING', channels: [], attempts: 0, payload: {} });
      expect(rows.get(ORDER.id).event).toBe('order.created');
      expect(prisma.partnerTransmission.update).not.toHaveBeenCalled();
    });

    it('still tells the partner when an attempt failed ambiguously (a timeout may have landed)', async () => {
      const { rows } = await cancelled(WEBHOOK, { status: 'FAILED', channels: [], attempts: 2, payload: {} });
      expect(rows.get(ORDER.id)).toMatchObject({ event: 'order.cancelled', targets: [] });
    });

    it('does nothing for an order with no record at all', async () => {
      const { service, prisma } = build(WEBHOOK, { order: CANCELLED_ORDER });
      await service.markCancelled([ORDER.id]);
      expect(prisma.partnerTransmission.update).not.toHaveBeenCalled();
    });

    it('sends a signed order.cancelled with its own idempotency key and no reason text', async () => {
      const { service } = await cancelled();
      const saved = await service.send(ORDER.id);
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers['x-telehealth-event']).toBe('order.cancelled');
      expect(init.headers['idempotency-key']).toBe(`${ORDER.id}:cancelled`);
      expect(init.headers['x-telehealth-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(JSON.parse(init.body)).toMatchObject({ event: 'order.cancelled', orderId: ORDER.id, reason: 'PRESCRIPTION_WITHDRAWN' });
      expect(init.body).not.toContain('pregnant');
      expect(saved).toMatchObject({ event: 'order.cancelled', status: 'SENT', attempts: 1 });
    });

    it('goes only to the channel that had the order', async () => {
      const { service, email } = await cancelled({ ...WEBHOOK, PARTNER_ORDER_EMAIL: 'ph@x.com' });
      await service.send(ORDER.id);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(email.sendPartnerOrderEmail).not.toHaveBeenCalled();
    });

    it('is sent by email with an unmissable subject', async () => {
      const { service, email } = await cancelled({ PARTNER_ORDER_EMAIL: 'ph@x.com' }, { ...delivered, channels: ['EMAIL'] });
      await service.send(ORDER.id);
      const [, subject, , attachment] = email.sendPartnerOrderEmail.mock.calls[0];
      expect(subject).toMatch(/CANCELLED.*do not dispatch/i);
      expect(attachment).toBeUndefined();
    });

    it('is retried like an order when the partner is down, and audited', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 502 });
      const { service, audit, rows } = await cancelled();
      expect(await service.send(ORDER.id)).toMatchObject({ status: 'FAILED', attempts: 1 });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORDER_CANCELLATION_PARTNER_SEND_FAILED' }));
      rows.get(ORDER.id).nextAttemptAt = null;
      expect(await service.send(ORDER.id)).toMatchObject({ status: 'SENT', attempts: 2, event: 'order.cancelled' });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORDER_CANCELLATION_SENT_TO_PARTNER' }));
    });

    it('is not blocked by the order having been cancelled (the order checks only apply to new orders)', async () => {
      const { service } = await cancelled();
      await expect(service.send(ORDER.id)).resolves.toMatchObject({ status: 'SENT' });
    });

    it('flushCancellations delivers what is waiting and never throws', async () => {
      const { service, prisma } = await cancelled();
      prisma.partnerTransmission.findMany.mockResolvedValue([{ orderId: ORDER.id }]);
      await service.flushCancellations();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockRejectedValue(new Error('down'));
      prisma.partnerTransmission.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.flushCancellations()).resolves.toBeUndefined();
    });

    it('a cancellation that lands while the order is being sent is not overwritten by that send finishing', async () => {
      let release!: () => void;
      fetchMock.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ ok: true, status: 200 }); }));
      const { service, prisma, rows } = build(WEBHOOK, { order: { ...ORDER, ...CANCELLED_ORDER, status: 'PENDING' } });
      const sending = service.send(ORDER.id);
      await new Promise((r) => setImmediate(r));
      await service.markCancelled([ORDER.id]);
      expect(rows.get(ORDER.id)).toMatchObject({ event: 'order.cancelled', targets: [] }); // in flight: tell every channel
      release();
      await sending;
      expect(rows.get(ORDER.id)).toMatchObject({ event: 'order.cancelled', status: 'PENDING', attempts: 0 });
      expect(prisma.partnerTransmission.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('sweep', () => {
    it('does nothing without a channel', async () => {
      expect(await build().service.sweep()).toEqual({ attempted: 0, sent: 0, failed: 0, skipped: 0 });
    });

    it('asks only for orders that can actually be sent, so ones that never can cannot fill the window', async () => {
      const { service, prisma } = build(WEBHOOK);
      await service.sweep(20);
      const query = prisma.order.findMany.mock.calls[0][0];
      expect(query.take).toBe(20);
      expect(query.where.status).toBe('PENDING');
      expect(query.where.prescription).toMatchObject({ status: 'ACTIVE', OR: [{ validUntil: null }, { validUntil: { gt: expect.any(Date) } }] });
      expect(query.where.patient).toMatchObject({
        addressLine1: { not: null }, city: { not: null }, postcode: { not: null }, country: { not: null },
        NOT: [{ addressLine1: '' }, { city: '' }, { postcode: '' }, { country: '' }],
      });
      // retries: not exhausted, not waiting out a back-off, not being sent right now
      const retry = query.where.OR[1].partnerTransmission;
      expect(retry).toMatchObject({ event: 'order.created', attempts: { lt: 8 } });
      expect(JSON.stringify(retry.AND)).toContain('nextAttemptAt');
      expect(JSON.stringify(retry.AND)).toContain('claimedAt');
    });

    it('sends cancellations before new orders', async () => {
      const { service, prisma } = build(WEBHOOK);
      prisma.partnerTransmission.findMany.mockResolvedValue([{ orderId: 'cancel-1' }]);
      prisma.order.findMany.mockResolvedValue([{ id: 'new-1' }]);
      const send = jest.spyOn(service, 'send').mockResolvedValue({ status: 'SENT' } as any);
      const result = await service.sweep();
      expect(send.mock.calls.map((c) => c[0])).toEqual(['cancel-1', 'new-1']);
      expect(result).toEqual({ attempted: 2, sent: 2, failed: 0, skipped: 0 });
    });

    it('reports failures, and treats "already being sent" or "no longer sendable" as skipped rather than failed', async () => {
      const { service, prisma } = build(WEBHOOK);
      prisma.order.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
      jest.spyOn(service, 'send')
        .mockResolvedValueOnce({ status: 'FAILED' } as any)
        .mockRejectedValueOnce(new ConflictException('busy'))
        .mockRejectedValueOnce(new BadRequestException('no address'))
        .mockRejectedValueOnce(new Error('boom'));
      expect(await service.sweep()).toEqual({ attempted: 4, sent: 0, failed: 2, skipped: 2 });
    });
  });
});

describe('retryDelayMinutes', () => {
  it('doubles from 5 minutes and stops at 4 hours', () => {
    expect([1, 2, 3, 4].map(retryDelayMinutes)).toEqual([5, 10, 20, 40]);
    expect(retryDelayMinutes(20)).toBe(240);
  });
});
