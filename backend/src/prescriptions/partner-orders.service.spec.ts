import { BadRequestException } from '@nestjs/common';
import { PartnerOrdersService, retryDelayMinutes } from './partner-orders.service';

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

function build(env: Record<string, string> = {}, over: { order?: any; transmission?: any } = {}) {
  const prisma: any = {
    order: {
      findUnique: jest.fn().mockResolvedValue(over.order ?? ORDER),
      findFirst: jest.fn().mockResolvedValue({ id: ORDER.id }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    },
    partnerTransmission: {
      findUnique: jest.fn().mockResolvedValue(over.transmission ?? null),
      upsert: jest.fn().mockImplementation(({ create, update }) => Promise.resolve({ ...(over.transmission ?? {}), ...(over.transmission ? update : create) })),
    },
  };
  const config = { get: jest.fn((k: string) => env[k]) };
  const email = { sendPartnerOrderEmail: jest.fn().mockResolvedValue(true) };
  const audit = { log: jest.fn() };
  const service = new PartnerOrdersService(prisma, config as any, email as any, audit as any);
  return { service, prisma, email, audit };
}

const WEBHOOK = { PARTNER_WEBHOOK_URL: 'https://partner.test/hook', PARTNER_WEBHOOK_SECRET: 's3cret' };

describe('PartnerOrdersService', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;
  });

  it('reports which channels are set up', () => {
    expect(build().service.integrationStatus()).toMatchObject({ webhookConfigured: false, emailConfigured: false });
    expect(build({ ...WEBHOOK, PARTNER_ORDER_EMAIL: 'a@x.com, b@x.com', PARTNER_NAME: 'PharmaCo' }).service.integrationStatus())
      .toEqual({ webhookConfigured: true, emailConfigured: true, partnerName: 'PharmaCo' });
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
    expect(init.headers['x-telehealth-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(JSON.parse(init.body)).toMatchObject({ orderId: ORDER.id, event: 'order.created' });
    expect(saved).toMatchObject({ status: 'SENT', channels: ['WEBHOOK'], attempts: 1, lastError: null });
    expect(prisma.partnerTransmission.upsert).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORDER_SENT_TO_PARTNER', resourceId: ORDER.id }));
  });

  it('records FAILED with the reason when the partner answers with an error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const { service, audit } = build(WEBHOOK);
    const saved = await service.send(ORDER.id);
    expect(saved).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(saved.lastError).toContain('503');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORDER_PARTNER_SEND_FAILED' }));
  });

  it('retries only the channel that has not accepted the order yet', async () => {
    const { service, email } = build(
      { ...WEBHOOK, PARTNER_ORDER_EMAIL: 'ph@x.com' },
      { transmission: { orderId: ORDER.id, status: 'FAILED', channels: ['WEBHOOK'], attempts: 1, sentAt: null } },
    );
    const saved = await service.send(ORDER.id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(email.sendPartnerOrderEmail).toHaveBeenCalledTimes(1);
    expect(saved).toMatchObject({ status: 'SENT', attempts: 2 });
    expect(saved.channels.sort()).toEqual(['EMAIL', 'WEBHOOK']);
  });

  it('treats an email provider that is not configured as a failure, not a success', async () => {
    const { service, email } = build({ PARTNER_ORDER_EMAIL: 'ph@x.com' });
    email.sendPartnerOrderEmail.mockResolvedValue(false);
    expect(await service.send(ORDER.id)).toMatchObject({ status: 'FAILED' });
  });

  it('force resends even an order that already went through', async () => {
    const { service } = build(WEBHOOK, { transmission: { orderId: ORDER.id, status: 'SENT', channels: ['WEBHOOK'], attempts: 1 } });
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

  describe('trySend', () => {
    it('does nothing when no channel is configured', async () => {
      const { service, prisma } = build();
      await service.trySend(ORDER.id);
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });

    it('skips an order the partner already has', async () => {
      const { service } = build(WEBHOOK, { transmission: { status: 'SENT' } });
      await service.trySend(ORDER.id);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never throws, even when the partner is down', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      const { service } = build(WEBHOOK);
      await expect(service.trySend(ORDER.id)).resolves.toBeUndefined();
    });
  });

  describe('sweep', () => {
    it('does nothing without a channel', async () => {
      expect(await build().service.sweep()).toEqual({ attempted: 0, sent: 0, failed: 0 });
    });

    it('retries failures only once their back-off has passed', async () => {
      const { service, prisma } = build(WEBHOOK);
      const ago = (min: number) => new Date(Date.now() - min * 60_000);
      prisma.order.findMany.mockResolvedValue([
        { id: 'due', partnerTransmission: { attempts: 1, lastAttemptAt: ago(6) } },
        { id: 'too-soon', partnerTransmission: { attempts: 1, lastAttemptAt: ago(2) } },
        { id: 'never-tried', partnerTransmission: null },
      ]);
      const send = jest.spyOn(service, 'send').mockResolvedValue({ status: 'SENT' } as any);
      const result = await service.sweep();
      expect(send.mock.calls.map((c) => c[0])).toEqual(['due', 'never-tried']);
      expect(result).toEqual({ attempted: 2, sent: 2, failed: 0 });
    });
  });
});

describe('retryDelayMinutes', () => {
  it('doubles from 5 minutes and stops at 4 hours', () => {
    expect([1, 2, 3, 4].map(retryDelayMinutes)).toEqual([5, 10, 20, 40]);
    expect(retryDelayMinutes(20)).toBe(240);
  });
});
