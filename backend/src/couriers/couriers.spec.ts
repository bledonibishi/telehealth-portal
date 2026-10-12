import { NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { CouriersController } from './couriers.controller';
import { CouriersService } from './couriers.service';

const SECRETS: Record<string, string> = { COURIER_WEBHOOK_SECRET: 'shared', COURIER_WEBHOOK_SECRET_BEKI: 'beki-only' };
const config = { get: (key: string) => SECRETS[key] };

function setup(trackers: any[] = [], settings: Record<string, string> = {}) {
  const prisma = { order: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  const orders = { applyTracking: jest.fn().mockResolvedValue('APPLIED') };
  const cfg = { get: (key: string) => settings[key] ?? SECRETS[key] };
  const service = new CouriersService(prisma as any, orders as any, cfg as any, trackers);
  return { prisma, orders, service, controller: new CouriersController(service) };
}

const call = (body: object, secret: string) => {
  const raw = Buffer.from(JSON.stringify(body));
  return { rawBody: raw, headers: { 'x-courier-signature': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}` } } as any;
};

describe('CouriersService', () => {
  it('uses the courier’s own secret when there is one, else the shared one', () => {
    const { service } = setup();
    expect(service.secretFor('beki')).toBe('beki-only');
    expect(service.secretFor('someone-else')).toBe('shared');
  });

  it('finds the order by our reference first, then by tracking number, and ignores what it cannot match', async () => {
    const { service, prisma, orders } = setup();
    prisma.order.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.id === 'o-1' ? { id: 'o-1' } : null));
    prisma.order.findFirst.mockImplementation(({ where }: any) => Promise.resolve(where.trackingNumber === 'T2' ? { id: 'o-2' } : null));
    const at = new Date('2026-10-05T08:00:00Z');
    const result = await service.handle(
      [
        { reference: 'o-1', status: 'PICKED_UP', occurredAt: at },
        { trackingNumber: 'T2', status: 'DELIVERED', occurredAt: at },
        { trackingNumber: 'UNKNOWN', status: 'DELIVERED', occurredAt: at },
      ],
      'beki',
    );
    expect(result).toEqual({ applied: 2, duplicates: 0, ignored: 1 });
    expect(orders.applyTracking).toHaveBeenCalledWith('o-1', expect.objectContaining({ status: 'PICKED_UP' }), 'WEBHOOK', 'system:courier:beki');
    expect(orders.applyTracking).toHaveBeenCalledWith('o-2', expect.objectContaining({ status: 'DELIVERED' }), 'WEBHOOK', 'system:courier:beki');
  });

  it('finds the order from the short code on the parcel, and does not guess when a code fits two orders', async () => {
    const { service, prisma, orders } = setup();
    const at = new Date('2026-10-05T08:00:00Z');
    prisma.order.findMany.mockResolvedValueOnce([{ id: 'cmabc12345678xyz9' }]).mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);

    const first = await service.handle([{ reference: 'th-5678XYZ9', status: 'PICKED_UP', occurredAt: at }], 'beki');
    expect(prisma.order.findMany).toHaveBeenCalledWith({ where: { id: { endsWith: '5678xyz9' } }, select: { id: true }, take: 2 });
    expect(orders.applyTracking).toHaveBeenCalledWith('cmabc12345678xyz9', expect.anything(), 'WEBHOOK', 'system:courier:beki');
    expect(first).toEqual({ applied: 1, duplicates: 0, ignored: 0 });

    orders.applyTracking.mockClear();
    const second = await service.handle([{ reference: 'TH-AAAAAAAA', status: 'PICKED_UP', occurredAt: at }], 'beki');
    expect(orders.applyTracking).not.toHaveBeenCalled();
    expect(second).toEqual({ applied: 0, duplicates: 0, ignored: 1 });
  });

  it('applies a batch oldest first, whatever order it arrived in, and counts duplicates', async () => {
    const { service, prisma, orders } = setup();
    prisma.order.findUnique.mockResolvedValue({ id: 'o-1' });
    orders.applyTracking.mockResolvedValueOnce('APPLIED').mockResolvedValueOnce('DUPLICATE');
    const result = await service.handle(
      [
        { reference: 'o-1', status: 'DELIVERED', occurredAt: new Date('2026-10-05T12:00:00Z') },
        { reference: 'o-1', status: 'PICKED_UP', occurredAt: new Date('2026-10-05T08:00:00Z') },
      ],
      'generic',
    );
    expect(orders.applyTracking.mock.calls.map((c) => c[1].status)).toEqual(['PICKED_UP', 'DELIVERED']);
    expect(result).toEqual({ applied: 1, duplicates: 1, ignored: 0 });
  });
});

describe('CouriersController', () => {
  const body = { reference: 'o-1', status: 'delivered', eventId: 'e1' };

  it('refuses a name that is not a plain word', async () => {
    const { controller } = setup();
    await expect(controller.webhook('../admin', call(body, 'shared'), body)).rejects.toThrow(NotFoundException);
  });

  it('says so when no secret is set up for the courier', async () => {
    const { prisma, orders, controller } = setup();
    const unset = new CouriersController(new CouriersService(prisma as any, orders as any, { get: () => undefined } as any));
    await expect(unset.webhook('generic', call(body, 'shared'), body)).rejects.toThrow(ServiceUnavailableException);
  });

  it('refuses a call that is not signed with the secret, and changes nothing', async () => {
    const { controller, orders } = setup();
    await expect(controller.webhook('generic', call(body, 'wrong'), body)).rejects.toThrow(UnauthorizedException);
    expect(orders.applyTracking).not.toHaveBeenCalled();
  });

  it('applies a correctly signed call and reports what happened', async () => {
    const { controller, prisma, orders } = setup();
    prisma.order.findUnique.mockResolvedValue({ id: 'o-1' });
    await expect(controller.webhook('generic', call(body, 'shared'), body)).resolves.toEqual({ applied: 1, duplicates: 0, ignored: 0 });
    expect(orders.applyTracking).toHaveBeenCalledWith('o-1', expect.objectContaining({ status: 'DELIVERED', externalId: 'e1' }), 'WEBHOOK', 'system:courier:generic');
  });

  it('lets any named courier use the generic format with its own secret', async () => {
    const { controller, prisma, orders } = setup();
    prisma.order.findUnique.mockResolvedValue({ id: 'o-1' });
    await expect(controller.webhook('beki', call(body, 'beki-only'), body)).resolves.toEqual({ applied: 1, duplicates: 0, ignored: 0 });
    expect(orders.applyTracking).toHaveBeenCalledWith('o-1', expect.anything(), 'WEBHOOK', 'system:courier:beki');
  });

  it('does not accept one courier’s secret on another courier’s URL', async () => {
    const { controller, orders } = setup();
    await expect(controller.webhook('dhl', call(body, 'beki-only'), body)).rejects.toThrow(UnauthorizedException);
    expect(orders.applyTracking).not.toHaveBeenCalled();
  });
});

describe('CouriersService.poll (couriers with a tracking API)', () => {
  const NOW = new Date('2026-10-07T12:00:00Z');
  const at = (iso: string) => new Date(iso);
  const tracker = (events: any[] = [], over: object = {}) => ({
    key: 'bekiapi',
    handles: (carrier: string) => /beki/i.test(carrier),
    fetch: jest.fn().mockResolvedValue(events),
    ...over,
  });
  const due = (id: string, carrier: string, trackingNumber: string) => ({ id, carrier, trackingNumber });

  it('asks only about parcels whose courier it has a tracker for, and only ones not asked about recently', async () => {
    const t = tracker();
    const { service, prisma } = setup([t]);
    prisma.order.findMany.mockResolvedValue([due('o-1', 'Posta BEKI', 'T1'), due('o-2', 'DHL', 'T2')]);
    const result = await service.poll(NOW);

    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['DISPATCHED', 'OUT_FOR_DELIVERY'] },
        trackingNumber: { not: null },
        OR: [{ trackingCheckedAt: null }, { trackingCheckedAt: { lt: new Date('2026-10-07T11:45:00Z') } }],
      }),
    }));
    expect(t.fetch).toHaveBeenCalledTimes(1);
    expect(t.fetch).toHaveBeenCalledWith('T1');
    expect(result.checked).toBe(1);
  });

  it('applies what the courier says like a webhook would, oldest first, as a poll', async () => {
    const t = tracker([
      { status: 'DELIVERED', occurredAt: at('2026-10-06T15:00:00Z') },
      { status: 'PICKED_UP', occurredAt: at('2026-10-05T09:00:00Z'), externalId: 'beki-1' },
    ]);
    const { service, prisma, orders } = setup([t]);
    prisma.order.findMany.mockResolvedValue([due('o-1', 'Posta BEKI', 'T1')]);
    orders.applyTracking.mockResolvedValueOnce('APPLIED').mockResolvedValueOnce('DUPLICATE');
    const result = await service.poll(NOW);

    expect(orders.applyTracking.mock.calls.map((c) => c[1].status)).toEqual(['PICKED_UP', 'DELIVERED']);
    expect(orders.applyTracking).toHaveBeenCalledWith('o-1', expect.objectContaining({ status: 'PICKED_UP', externalId: 'beki-1' }), 'POLL', 'system:courier:bekiapi');
    // A step the courier gave no id for still gets one, so asking again can't record it twice.
    expect(orders.applyTracking.mock.calls[1][1].externalId).toBe(`poll:T1:DELIVERED:${at('2026-10-06T15:00:00Z').getTime()}`);
    expect(result).toEqual({ applied: 1, duplicates: 1, ignored: 0, checked: 1 });
  });

  it('marks the parcel as just asked about before asking, and skips one another server already took', async () => {
    const t = tracker();
    const { service, prisma } = setup([t]);
    prisma.order.findMany.mockResolvedValue([due('o-1', 'Posta BEKI', 'T1'), due('o-2', 'Posta BEKI', 'T2')]);
    prisma.order.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await service.poll(NOW);

    expect(prisma.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'o-1' }), data: { trackingCheckedAt: NOW } }));
    expect(t.fetch).toHaveBeenCalledTimes(1);
    expect(t.fetch).toHaveBeenCalledWith('T1');
  });

  it('carries on with the other parcels when the courier cannot be reached for one', async () => {
    const t = tracker([{ status: 'IN_TRANSIT', occurredAt: at('2026-10-06T10:00:00Z') }]);
    t.fetch.mockRejectedValueOnce(new Error('timeout'));
    const { service, prisma, orders } = setup([t]);
    prisma.order.findMany.mockResolvedValue([due('o-1', 'Posta BEKI', 'T1'), due('o-2', 'Posta BEKI', 'T2')]);
    await expect(service.poll(NOW)).resolves.toMatchObject({ checked: 2, applied: 1 });
    expect(orders.applyTracking).toHaveBeenCalledTimes(1);
  });

  it('does nothing on its schedule until a courier with a tracking API exists, or when switched off', async () => {
    const none = setup([]);
    await none.service.pollTrackers();
    expect(none.prisma.order.findMany).not.toHaveBeenCalled();

    const off = setup([tracker()], { COURIER_POLLING: 'false' });
    await off.service.pollTrackers();
    expect(off.prisma.order.findMany).not.toHaveBeenCalled();

    const on = setup([tracker()]);
    await on.service.pollTrackers();
    expect(on.prisma.order.findMany).toHaveBeenCalled();
  });

  it('honours COURIER_POLL_MINUTES', async () => {
    const { service, prisma } = setup([tracker()], { COURIER_POLL_MINUTES: '60' });
    await service.poll(NOW);
    expect(prisma.order.findMany.mock.calls[0][0].where.OR[1]).toEqual({ trackingCheckedAt: { lt: new Date('2026-10-07T11:00:00Z') } });
  });
});
