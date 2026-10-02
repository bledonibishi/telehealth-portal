import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { churnRate, summariseSubscriptions, type SubscriptionLike } from './revenue-calc';

/** Subscriptions are read from Stripe, so keep the answer for a few minutes rather than re-reading on every page view. */
const CACHE_MS = 5 * 60_000;
/** Safety cap on how much of Stripe's history one request reads. */
const MAX_SUBSCRIPTIONS = 2_000;

export interface RevenueOverview {
  configured: boolean;
  periodDays: number;
  asOf: Date;
  activeSubscribers: number;
  pastDueSubscribers: number;
  mrr: Array<{ currency: string; amountCents: number }>;
  newSubscribers: number;
  cancellations: number;
  /** Cancellations that were a clinician declining the patient (the payment is refunded) — not the patient leaving. */
  clinicalDeclines: number;
  /** Patients who chose to leave, as a share of those subscribed at the start of the period. */
  churnRate: number | null;
  /** True when Stripe had more subscriptions than one request reads, so the figures are partial. */
  truncated: boolean;
  /** Set when Stripe is set up but refused or failed the request (for instance a wrong API key). */
  error: string | null;
}

/** The sample value from .env.example and similar stand-ins are not real keys, so Stripe isn't even asked. */
export const isPlaceholderKey = (key: string) => /your[_-]?key|placeholder|changeme|replace[_-]?me|^sk_(test|live)_x+$/i.test(key);

/** After a failure, don't ask Stripe again for a minute — and don't fill the log with the same error. */
const FAILURE_CACHE_MS = 60_000;

@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);
  private stripe: Stripe | null;
  private cache = new Map<number, { at: number; value: RevenueOverview }>();

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    const key = config.get<string>('STRIPE_SECRET_KEY')?.trim();
    this.stripe = key && !isPlaceholderKey(key) ? new Stripe(key, { apiVersion: '2023-10-16' as any }) : null;
  }

  async overview(periodDays: number, now = new Date()): Promise<RevenueOverview> {
    const empty: RevenueOverview = {
      configured: false, periodDays, asOf: now, activeSubscribers: 0, pastDueSubscribers: 0, mrr: [],
      newSubscribers: 0, cancellations: 0, clinicalDeclines: 0, churnRate: null, truncated: false, error: null,
    };
    if (!this.stripe) return empty;

    const hit = this.cache.get(periodDays);
    if (hit && now.getTime() - hit.at < (hit.value.error ? FAILURE_CACHE_MS : CACHE_MS)) return hit.value;

    const subs: SubscriptionLike[] = [];
    let truncated = false;
    try {
      for await (const s of this.stripe.subscriptions.list({ status: 'all', limit: 100 })) {
        if (subs.length >= MAX_SUBSCRIPTIONS) { truncated = true; break; }
        subs.push(s as unknown as SubscriptionLike);
      }
    } catch (err: any) {
      const message = String(err?.message ?? err);
      this.logger.error(`Could not read subscriptions from Stripe: ${message}`);
      // Stripe's own message is safe to show (it masks the key) and tells the admin what to fix.
      const failed: RevenueOverview = { ...empty, configured: true, error: message };
      this.cache.set(periodDays, { at: now.getTime(), value: failed });
      return failed;
    }

    const sum = summariseSubscriptions(subs, now, periodDays);

    // A clinician declining a patient cancels and refunds their subscription — that is not churn.
    const declined = sum.canceledIds.length
      ? await this.prisma.patient.findMany({
          where: {
            stripeSubscriptionId: { in: sum.canceledIds },
            consultations: { some: { refundStatus: 'REFUNDED' } },
          },
          select: { stripeSubscriptionId: true },
        })
      : [];
    const declinedIds = new Set(declined.map((p) => p.stripeSubscriptionId));
    const voluntaryFromStart = sum.canceledFromStartIds.filter((id) => !declinedIds.has(id)).length;

    const value: RevenueOverview = {
      configured: true,
      periodDays,
      asOf: now,
      activeSubscribers: sum.activeSubscribers,
      pastDueSubscribers: sum.pastDueSubscribers,
      mrr: sum.mrr,
      newSubscribers: sum.newSubscribers,
      cancellations: sum.cancellations,
      clinicalDeclines: sum.canceledIds.filter((id) => declinedIds.has(id)).length,
      churnRate: churnRate(voluntaryFromStart, sum.startSubscribers - sum.canceledFromStartIds.filter((id) => declinedIds.has(id)).length),
      truncated,
      error: null,
    };
    this.cache.set(periodDays, { at: now.getTime(), value });
    return value;
  }
}
