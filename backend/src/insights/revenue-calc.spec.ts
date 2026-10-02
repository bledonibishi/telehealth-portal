import { churnRate, monthlyAmountCents, summariseSubscriptions, type SubscriptionLike } from './revenue-calc';

const NOW = new Date('2026-10-15T00:00:00Z');
const ago = (days: number) => Math.floor((NOW.getTime() - days * 86_400_000) / 1000);

const sub = (id: string, over: Partial<SubscriptionLike> & { amount?: number; interval?: string; every?: number; qty?: number } = {}): SubscriptionLike => ({
  id,
  status: 'active',
  created: ago(100),
  canceled_at: null,
  items: [{ quantity: over.qty ?? 1, price: { unit_amount: over.amount ?? 15000, currency: 'eur', recurring: { interval: over.interval ?? 'month', interval_count: over.every ?? 1 } } }],
  ...over,
});

describe('monthlyAmountCents', () => {
  const item = (amount: number, interval: string, every = 1, quantity = 1) => ({ quantity, price: { unit_amount: amount, currency: 'eur', recurring: { interval, interval_count: every } } });

  it('normalises each billing interval to a month', () => {
    expect(monthlyAmountCents(item(10000, 'month'))).toBe(10000);
    expect(monthlyAmountCents(item(120000, 'year'))).toBe(10000);
    expect(monthlyAmountCents(item(30000, 'month', 3))).toBe(10000);
    expect(Math.round(monthlyAmountCents(item(2500, 'week')))).toBe(10833);
  });

  it('multiplies by quantity and treats a missing price as 0', () => {
    expect(monthlyAmountCents(item(10000, 'month', 1, 2))).toBe(20000);
    expect(monthlyAmountCents({ quantity: 1, price: { unit_amount: null, currency: 'eur', recurring: { interval: 'month' } } })).toBe(0);
  });
});

describe('summariseSubscriptions', () => {
  it('sums MRR over active and trialing subscriptions only, per currency', () => {
    const s = summariseSubscriptions([
      sub('a', { amount: 15000 }),
      sub('b', { amount: 20000, status: 'trialing' }),
      sub('c', { amount: 99900, status: 'past_due' }),
      sub('d', { amount: 99900, status: 'incomplete' }),
      sub('e', { amount: 5000, status: 'canceled', canceled_at: ago(60), created: ago(200) }),
    ], NOW, 30);
    expect(s.mrr).toEqual([{ currency: 'EUR', amountCents: 35000 }]);
    expect(s.activeSubscribers).toBe(2);
    expect(s.pastDueSubscribers).toBe(1);
  });

  it('counts new subscribers and cancellations inside the period', () => {
    const s = summariseSubscriptions([
      sub('old-active', { created: ago(200) }),
      sub('new-active', { created: ago(5) }),
      sub('left-recently', { status: 'canceled', canceled_at: ago(10), created: ago(200) }),
      sub('left-long-ago', { status: 'canceled', canceled_at: ago(80), created: ago(200) }),
    ], NOW, 30);
    expect(s.newSubscribers).toBe(1);
    expect(s.cancellations).toBe(1);
    expect(s.canceledIds).toEqual(['left-recently']);
  });

  it('defines the starting group as those already subscribed when the period began', () => {
    const s = summariseSubscriptions([
      sub('stayed', { created: ago(200) }),
      sub('left', { status: 'canceled', canceled_at: ago(10), created: ago(200) }),
      sub('joined-and-left', { status: 'canceled', canceled_at: ago(3), created: ago(7) }), // wasn't there at the start
      sub('left-before', { status: 'canceled', canceled_at: ago(80), created: ago(200) }), // gone before the start
      sub('joined', { created: ago(5) }),
    ], NOW, 30);
    expect(s.startSubscribers).toBe(2);
    expect(s.canceledFromStartIds).toEqual(['left']);
    expect(s.cancellations).toBe(2);
  });
});

describe('churnRate', () => {
  it('is a percentage of the starting group, to one decimal', () => {
    expect(churnRate(3, 40)).toBe(7.5);
    expect(churnRate(0, 40)).toBe(0);
  });
  it('is null when there was nobody to lose', () => {
    expect(churnRate(0, 0)).toBeNull();
  });
});
