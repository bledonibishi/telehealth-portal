import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../prescriptions/orders.service';
import { COURIER_TRACKERS, type CourierAdapter, type CourierTracker, type TrackingEventInput } from './courier-adapter';
import { GenericCourierAdapter } from './generic.adapter';

/** What happened to a batch of events: the three counts always add up to the number sent. */
export interface CourierResult {
  applied: number;
  duplicates: number;
  ignored: number;
}

/**
 * Turns what couriers tell us into changes on orders. The adapters know each sender's format; this finds the
 * order an event is about and hands it to OrdersService.applyTracking, the same path staff use.
 * A courier that sends our generic format needs no code: give it a name and a secret. A service with its own
 * format (AfterShip, EasyPost…) gets an adapter written and listed here.
 */
@Injectable()
export class CouriersService {
  private readonly logger = new Logger(CouriersService.name);
  private readonly adapters = new Map<string, CourierAdapter>();

  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
    private config: ConfigService,
    @Optional() @Inject(COURIER_TRACKERS) private trackers: CourierTracker[] = [],
  ) {
    for (const adapter of [new GenericCourierAdapter()]) this.adapters.set(adapter.key, adapter);
  }

  /**
   * The adapter for a URL name. A service with its own format has its own adapter; any other name (a courier
   * called "beki", say) speaks our generic format, so adding a courier is just a name and a secret.
   * Null for a name that isn't a plain word.
   */
  adapter(provider: string): CourierAdapter | null {
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(provider)) return null;
    return this.adapters.get(provider.toLowerCase()) ?? this.adapters.get('generic') ?? null;
  }

  /** The shared secret for one sender: COURIER_WEBHOOK_SECRET_<NAME>, else COURIER_WEBHOOK_SECRET. Empty when neither is set. */
  secretFor(provider: string) {
    const name = provider.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return this.config.get<string>(`COURIER_WEBHOOK_SECRET_${name}`)?.trim() || this.config.get<string>('COURIER_WEBHOOK_SECRET')?.trim() || '';
  }

  async handle(events: TrackingEventInput[], provider: string): Promise<CourierResult> {
    const result: CourierResult = { applied: 0, duplicates: 0, ignored: 0 };
    // Oldest first, so a batch that arrives out of order still tells the story in order.
    for (const event of [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
      const orderId = await this.orderFor(event);
      if (!orderId) {
        this.logger.warn(`${provider}: no order for ${event.reference ?? event.trackingNumber} (${event.status}) — ignored`);
        result.ignored++;
        continue;
      }
      const outcome = await this.orders.applyTracking(orderId, event, 'WEBHOOK', `system:courier:${provider}`);
      if (outcome === 'APPLIED') result.applied++;
      else if (outcome === 'DUPLICATE') result.duplicates++;
      else result.ignored++;
    }
    return result;
  }

  /** Runs on a schedule; does nothing until a courier with a tracking API has been added. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async pollTrackers() {
    if (this.trackers.length === 0 || this.config.get<string>('COURIER_POLLING') === 'false') return;
    try {
      await this.poll();
    } catch (err: any) {
      this.logger.error(`Courier polling failed: ${err?.message}`);
    }
  }

  /**
   * Asks each courier's tracking API about the parcels it is carrying, at most once per COURIER_POLL_MINUTES
   * (default 15) per parcel, and applies the answer like a webhook would. A parcel with no tracker for its
   * courier is left alone, for staff to update by hand.
   */
  async poll(now = new Date()): Promise<CourierResult & { checked: number }> {
    const minutes = Number(this.config.get<string>('COURIER_POLL_MINUTES'));
    const since = new Date(now.getTime() - (Number.isInteger(minutes) && minutes > 0 ? minutes : 15) * 60_000);
    const stale = [{ trackingCheckedAt: null }, { trackingCheckedAt: { lt: since } }];

    const due = await this.prisma.order.findMany({
      where: { status: { in: ['DISPATCHED', 'OUT_FOR_DELIVERY'] }, trackingNumber: { not: null }, carrier: { not: null }, OR: stale },
      orderBy: { trackingCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: 50,
      select: { id: true, carrier: true, trackingNumber: true },
    });

    const result = { applied: 0, duplicates: 0, ignored: 0, checked: 0 };
    for (const order of due) {
      const tracker = this.trackers.find((t) => t.handles(order.carrier!));
      if (!tracker) continue;
      // Claim it first, so a second server (or a slow courier) doesn't mean it is asked twice.
      const claimed = await this.prisma.order.updateMany({ where: { id: order.id, OR: stale }, data: { trackingCheckedAt: now } });
      if (claimed.count === 0) continue;
      result.checked++;
      try {
        const events = await tracker.fetch(order.trackingNumber!);
        for (const event of [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
          // A tracker that gives no id of its own still can't record the same step twice.
          const externalId = event.externalId ?? `poll:${order.trackingNumber}:${event.status}:${event.occurredAt.getTime()}`;
          const outcome = await this.orders.applyTracking(order.id, { ...event, externalId }, 'POLL', `system:courier:${tracker.key}`);
          if (outcome === 'APPLIED') result.applied++;
          else if (outcome === 'DUPLICATE') result.duplicates++;
          else result.ignored++;
        }
      } catch (err: any) {
        this.logger.warn(`${tracker.key}: could not get ${order.trackingNumber} — ${err?.message}`);
      }
    }
    return result;
  }

  /**
   * Finds the order an event is about. Our own reference wins: the short code on the parcel (TH-XXXXXXXX), or the
   * full order id; otherwise the tracking number on the order. A code that fits more than one order is not guessed at.
   */
  private async orderFor(event: TrackingEventInput): Promise<string | null> {
    if (event.reference) {
      const ref = event.reference.trim();
      const short = /^TH-([A-Z0-9]{8})$/i.exec(ref);
      if (short) {
        // The code is the last 8 characters of the order id, in capitals.
        const matches = await this.prisma.order.findMany({ where: { id: { endsWith: short[1].toLowerCase() } }, select: { id: true }, take: 2 });
        if (matches.length === 1) return matches[0].id;
        if (matches.length > 1) this.logger.warn(`Reference ${ref} fits more than one order — not guessing`);
      } else {
        const byId = await this.prisma.order.findUnique({ where: { id: ref }, select: { id: true } });
        if (byId) return byId.id;
      }
    }
    if (event.trackingNumber) {
      const byTracking = await this.prisma.order.findFirst({ where: { trackingNumber: event.trackingNumber }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      if (byTracking) return byTracking.id;
    }
    return null;
  }
}
