import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { CheckInOutcome, ConsultationKind } from '../common/enums';
import { isPlaceholderKey } from './revenue.service';
import { type MonthBucket, type PaidInvoice, monthBuckets, revenueByMonth, weightOutcomes } from './monthly-report';

/** Stripe is read once for the whole range and kept a few minutes, like the revenue overview. */
const CACHE_MS = 5 * 60_000;
const FAILURE_CACHE_MS = 60_000;
/** Safety cap on how many invoices one request reads. */
const MAX_INVOICES = 5_000;

export interface MonthRow {
  month: string;
  newLeads: number;
  newPatients: number;
  subscriptionsEnded: number;
  ordersDispatched: number;
  checkInsReviewed: number;
  continued: number;
  held: number;
  stopped: number;
  revenue: { currency: string; amountCents: number }[];
  weighedPatients: number;
  avgLossPct: number | null;
  successRatePct: number | null;
}

export interface MonthlyReport {
  /** False when Stripe is not set up, so revenue is empty (everything else still counts). */
  revenueConfigured: boolean;
  revenueError: string | null;
  /** True when Stripe had more invoices than one request reads, so the oldest months may be short. */
  revenueTruncated: boolean;
  months: MonthRow[];
}

@Injectable()
export class MonthlyReportService {
  private readonly logger = new Logger(MonthlyReportService.name);
  private stripe: Stripe | null;
  private cache = new Map<string, { at: number; failed: boolean; value: { invoices: PaidInvoice[]; truncated: boolean; error: string | null } }>();

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    const key = config.get<string>('STRIPE_SECRET_KEY')?.trim();
    this.stripe = key && !isPlaceholderKey(key) ? new Stripe(key, { apiVersion: '2023-10-16' as any }) : null;
  }

  async report(count: number, now: Date = new Date()): Promise<MonthlyReport> {
    const buckets = monthBuckets(now, count);
    const from = buckets[buckets.length - 1].start;
    const to = buckets[0].end;
    const inRange = (field: string) => ({ [field]: { gte: from, lt: to } });

    const [leads, patients, ended, dispatched, reviewed, checkIns] = await Promise.all([
      this.prisma.lead.findMany({ where: inRange('createdAt'), select: { createdAt: true } }),
      this.prisma.patient.findMany({ where: inRange('activatedAt'), select: { activatedAt: true } }),
      this.prisma.patient.findMany({ where: inRange('subscriptionEndedAt'), select: { subscriptionEndedAt: true } }),
      this.prisma.order.findMany({ where: inRange('dispatchedAt'), select: { dispatchedAt: true } }),
      this.prisma.checkIn.findMany({ where: inRange('reviewedAt'), select: { reviewedAt: true, outcome: true } }),
      this.prisma.checkIn.findMany({
        where: { kind: ConsultationKind.GLP1, weightKg: { not: null }, ...inRange('completedAt') },
        select: { patientId: true, weightKg: true, completedAt: true },
      }),
    ]);
    const goals = checkIns.length
      ? await this.prisma.weightGoal.findMany({ where: { patientId: { in: [...new Set(checkIns.map((c) => c.patientId))] } }, select: { patientId: true, startingWeightKg: true } })
      : [];
    const outcomes = weightOutcomes(
      checkIns.map((c) => ({ patientId: c.patientId, weightKg: Number(c.weightKg), at: c.completedAt! })),
      new Map(goals.map((g) => [g.patientId, Number(g.startingWeightKg)])),
      buckets,
    );
    const stripeData = await this.paidInvoices(from, to, now);
    const revenue = revenueByMonth(stripeData.invoices, buckets);

    const countIn = (rows: (Date | null)[], b: MonthBucket) => rows.filter((d) => d && d >= b.start && d < b.end).length;
    const reviewedIn = (b: MonthBucket) => reviewed.filter((r) => r.reviewedAt && r.reviewedAt >= b.start && r.reviewedAt < b.end);

    return {
      revenueConfigured: !!this.stripe,
      revenueError: stripeData.error,
      revenueTruncated: stripeData.truncated,
      months: buckets.map((b) => {
        const r = reviewedIn(b);
        const w = outcomes.get(b.key)!;
        return {
          month: b.key,
          newLeads: countIn(leads.map((l) => l.createdAt), b),
          newPatients: countIn(patients.map((p) => p.activatedAt), b),
          subscriptionsEnded: countIn(ended.map((p) => p.subscriptionEndedAt), b),
          ordersDispatched: countIn(dispatched.map((o) => o.dispatchedAt), b),
          checkInsReviewed: r.length,
          continued: r.filter((c) => c.outcome === CheckInOutcome.REPEAT || c.outcome === CheckInOutcome.NEW_PRESCRIPTION).length,
          held: r.filter((c) => c.outcome === CheckInOutcome.HOLD).length,
          stopped: r.filter((c) => c.outcome === CheckInOutcome.STOP).length,
          revenue: revenue.get(b.key) ?? [],
          weighedPatients: w.patients,
          avgLossPct: w.avgLossPct,
          successRatePct: w.successRatePct,
        };
      }),
    };
  }

  private async paidInvoices(from: Date, to: Date, now: Date) {
    const none = { invoices: [] as PaidInvoice[], truncated: false, error: null as string | null };
    if (!this.stripe) return none;
    const cacheKey = `${from.toISOString()}|${to.toISOString()}`;
    const hit = this.cache.get(cacheKey);
    if (hit && now.getTime() - hit.at < (hit.failed ? FAILURE_CACHE_MS : CACHE_MS)) return hit.value;

    const invoices: PaidInvoice[] = [];
    let truncated = false;
    try {
      for await (const inv of this.stripe.invoices.list({ status: 'paid', created: { gte: Math.floor(from.getTime() / 1000), lt: Math.floor(to.getTime() / 1000) }, limit: 100 })) {
        if (invoices.length >= MAX_INVOICES) { truncated = true; break; }
        invoices.push({ created: inv.created, currency: inv.currency, amountPaid: inv.amount_paid });
      }
    } catch (err: any) {
      const message = String(err?.message ?? err);
      this.logger.error(`Could not read invoices from Stripe: ${message}`);
      const failed = { ...none, error: message };
      this.cache.set(cacheKey, { at: now.getTime(), failed: true, value: failed });
      return failed;
    }
    const value = { invoices, truncated, error: null };
    this.cache.set(cacheKey, { at: now.getTime(), failed: false, value });
    return value;
  }
}
