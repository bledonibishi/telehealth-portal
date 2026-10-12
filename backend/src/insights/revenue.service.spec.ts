import { RevenueService, isPlaceholderKey } from './revenue.service';

const NOW = new Date('2026-10-15T00:00:00Z');
const ago = (d: number) => Math.floor((NOW.getTime() - d * 86_400_000) / 1000);
const sub = (id: string, over: any = {}) => ({
  id, status: 'active', created: ago(200), canceled_at: null,
  items: [{ quantity: 1, price: { unit_amount: 10000, currency: 'eur', recurring: { interval: 'month', interval_count: 1 } } }],
  ...over,
});

function build(key: string | undefined, subs: any[], declinedSubIds: string[] = []) {
  const prisma: any = { patient: { findMany: jest.fn().mockResolvedValue(declinedSubIds.map((id) => ({ stripeSubscriptionId: id }))) } };
  const service = new RevenueService({ get: () => key } as any, prisma);
  const list = jest.fn().mockImplementation(async function* () { for (const s of subs) yield s; });
  if (key) (service as any).stripe = { subscriptions: { list } };
  return { service, prisma, list };
}

describe('RevenueService.overview', () => {
  it('reports nothing, without calling Stripe, when no key is configured', async () => {
    const { service } = build(undefined, []);
    expect(await service.overview(30, NOW)).toMatchObject({ configured: false, activeSubscribers: 0, mrr: [], churnRate: null });
  });

  it('works out MRR and churn, leaving clinical declines out of churn', async () => {
    const { service, prisma } = build('sk_test', [
      sub('a'), sub('b'), sub('c'), sub('d'),                                         // 4 still subscribed
      sub('left', { status: 'canceled', canceled_at: ago(10) }),                      // a patient who left
      sub('declined', { status: 'canceled', canceled_at: ago(5) }),                   // refunded after a doctor declined them
      sub('new', { created: ago(3) }),
    ], ['declined']);
    const r = await service.overview(30, NOW);

    expect(prisma.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ stripeSubscriptionId: { in: ['left', 'declined'] } }) }));
    expect(r).toMatchObject({ configured: true, activeSubscribers: 5, newSubscribers: 1, cancellations: 2, clinicalDeclines: 1, truncated: false });
    expect(r.mrr).toEqual([{ currency: 'EUR', amountCents: 50000 }]);
    // Started with a,b,c,d + left (declined excluded) = 5; one of them left = 20%.
    expect(r.churnRate).toBe(20);
  });

  it('reuses a recent answer instead of asking Stripe again', async () => {
    const { service, list } = build('sk_test', [sub('a')]);
    await service.overview(30, NOW);
    await service.overview(30, new Date(NOW.getTime() + 60_000));
    expect(list).toHaveBeenCalledTimes(1);
    await service.overview(30, new Date(NOW.getTime() + 10 * 60_000));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('reports a Stripe failure instead of throwing, and does not ask again straight away', async () => {
    const { service } = build('sk_test', []);
    const list = jest.fn(() => { throw new Error('Invalid API Key provided: sk_test_****here'); });
    (service as any).stripe = { subscriptions: { list } };

    const first = await service.overview(30, NOW);
    expect(first).toMatchObject({ configured: true, error: 'Invalid API Key provided: sk_test_****here', activeSubscribers: 0 });
    await service.overview(30, new Date(NOW.getTime() + 30_000));
    expect(list).toHaveBeenCalledTimes(1);
    await service.overview(30, new Date(NOW.getTime() + 90_000));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('treats the .env.example sample key as not configured, without calling Stripe', async () => {
    const service = new RevenueService({ get: () => 'sk_test_your_key_here' } as any, {} as any);
    expect(await service.overview(30, NOW)).toMatchObject({ configured: false, error: null });
  });
});

describe('isPlaceholderKey', () => {
  it('spots stand-in keys but not real-looking ones', () => {
    expect(['sk_test_your_key_here', 'sk_live_xxxx', 'CHANGEME', 'replace_me'].every(isPlaceholderKey)).toBe(true);
    expect(isPlaceholderKey('sk_test_51Nabcdef123456')).toBe(false);
  });
});
