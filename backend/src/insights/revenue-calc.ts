const DAY_MS = 86_400_000;

/** The slice of a Stripe subscription these numbers need (so tests don't need the SDK). */
export interface SubscriptionLike {
  id: string;
  status: string;
  /** Unix seconds. */
  created: number;
  /** When cancellation was requested. For cancel-at-period-end this is well before the subscription really stops. */
  canceled_at: number | null;
  /** When the subscription actually ended. */
  ended_at?: number | null;
  items: Array<{
    quantity?: number | null;
    price: { unit_amount: number | null; currency: string; recurring?: { interval: string; interval_count?: number | null } | null };
  }>;
}

/** What one subscription item brings in per month, in the smallest currency unit (cents). */
export function monthlyAmountCents(item: SubscriptionLike['items'][number]): number {
  const unit = item.price.unit_amount ?? 0;
  const qty = item.quantity ?? 1;
  const every = item.price.recurring?.interval_count || 1;
  const monthsPerPeriod = { day: 1 / 30, week: 12 / 52, month: 1, year: 12 }[item.price.recurring?.interval ?? 'month'] ?? 1;
  return (unit * qty) / (monthsPerPeriod * every);
}

/** Subscriptions that count as paying customers right now. */
const LIVE = ['active', 'trialing'];
const AT_RISK = 'past_due';

export interface RevenueSummary {
  activeSubscribers: number;
  pastDueSubscribers: number;
  /** Per currency, in cents, from list price (before any discount). */
  mrr: Array<{ currency: string; amountCents: number }>;
  newSubscribers: number;
  /** Everything that ended in the period, whatever the reason. */
  cancellations: number;
  /** Ended subscriptions in the period, by id — the caller decides which were clinical declines. */
  canceledIds: string[];
  /** People who were subscribed when the period began. */
  startSubscribers: number;
  /** Of those, how many ended during the period, by id. */
  canceledFromStartIds: string[];
}

export function summariseSubscriptions(subs: SubscriptionLike[], now: Date, periodDays: number): RevenueSummary {
  const since = (now.getTime() - periodDays * DAY_MS) / 1000;
  const mrr = new Map<string, number>();
  let active = 0;
  let pastDue = 0;
  let created = 0;
  let startSubscribers = 0;
  const canceledIds: string[] = [];
  const canceledFromStartIds: string[] = [];

  for (const s of subs) {
    const live = LIVE.includes(s.status);
    if (live) {
      active++;
      for (const item of s.items) {
        const cur = item.price.currency.toUpperCase();
        mrr.set(cur, (mrr.get(cur) ?? 0) + monthlyAmountCents(item));
      }
    } else if (s.status === AT_RISK) {
      pastDue++;
    }
    if (s.created >= since) created++;

    // It counts as lost when it really stopped, not when the cancellation was asked for.
    const endedAt = s.ended_at ?? s.canceled_at;
    const endedInPeriod = s.status === 'canceled' && endedAt !== null && endedAt >= since;
    if (endedInPeriod) canceledIds.push(s.id);

    // Counted at the start if it already existed and had not ended before the period began.
    const existedAtStart = s.created < since;
    const stillRunningAtStart = live || s.status === AT_RISK || endedInPeriod;
    if (existedAtStart && stillRunningAtStart) {
      startSubscribers++;
      if (endedInPeriod) canceledFromStartIds.push(s.id);
    }
  }

  return {
    activeSubscribers: active,
    pastDueSubscribers: pastDue,
    mrr: [...mrr.entries()].map(([currency, amountCents]) => ({ currency, amountCents: Math.round(amountCents) })).sort((a, b) => b.amountCents - a.amountCents),
    newSubscribers: created,
    cancellations: canceledIds.length,
    canceledIds,
    startSubscribers,
    canceledFromStartIds,
  };
}

/** Share of the starting subscribers lost in the period, as a percentage; null when nobody was there to lose. */
export function churnRate(lost: number, startSubscribers: number): number | null {
  if (startSubscribers <= 0) return null;
  return Math.round((lost / startSubscribers) * 1000) / 10;
}
