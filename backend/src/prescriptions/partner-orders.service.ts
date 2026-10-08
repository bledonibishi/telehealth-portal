import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { OrderStatus, PrescriptionStatus, UserRole } from '../common/enums';
import {
  PARTNER_ORDER_INCLUDE,
  buildCancelPayload,
  buildPartnerPayload,
  partnerCancelEmailSummary,
  partnerPingSummary,
  signPartnerBody,
  type PartnerCancelPayload,
  type PartnerMessage,
  type PartnerOrderPayload,
} from './partner-payload';

type Channel = 'WEBHOOK' | 'EMAIL';
type Db = PrismaService | Prisma.TransactionClient;

/** Give up on automatic retries after this many attempts; a person can still resend by hand. */
export const MAX_AUTOMATIC_ATTEMPTS = 8;
const INLINE_TIMEOUT_MS = 5_000;
const BACKGROUND_TIMEOUT_MS = 10_000;
/** A brand-new order is left alone for a moment so the request that created it can send it first. */
const SWEEP_GRACE_MS = 60_000;
/** A sender holds an order this long; after that it is presumed crashed and someone else may take over. */
export const CLAIM_TTL_MS = 2 * 60_000;

const CREATED = 'order.created';
const CANCELLED = 'order.cancelled';

/** Minutes to wait before the next automatic retry: 5, 10, 20 … capped at 4 hours. */
export const retryDelayMinutes = (attempts: number) => Math.min(5 * 2 ** Math.max(attempts - 1, 0), 240);

/**
 * Passes each new pharmacy order on to the external partner pharmacy as a structured, signed
 * message — by webhook, by email, or both, depending on what is configured:
 *   PARTNER_WEBHOOK_URL + PARTNER_WEBHOOK_SECRET     signed POST of the JSON payload (both are required)
 *   PARTNER_ORDER_EMAIL                              comma-separated recipients
 * Nothing leaves the platform unless one of them is set. The payload can always be viewed
 * and copied from the Orders page, which is also how a partner without an API is served.
 *
 * If an order is cancelled after the partner was given it, the same record is switched over to an
 * "order.cancelled" message that is delivered and retried exactly like the order was.
 */
@Injectable()
export class PartnerOrdersService {
  private readonly logger = new Logger(PartnerOrdersService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private email: EmailService,
    private audit: AuditService,
  ) {}

  get webhookUrl() {
    return this.config.get<string>('PARTNER_WEBHOOK_URL')?.trim() || null;
  }
  get webhookSecret() {
    return this.config.get<string>('PARTNER_WEBHOOK_SECRET')?.trim() || null;
  }
  get emailRecipients(): string[] {
    return (this.config.get<string>('PARTNER_ORDER_EMAIL') ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
  }

  /** Set when the webhook is half-configured: orders are never posted unsigned. */
  configurationProblem(): string | null {
    if (this.webhookUrl && !this.webhookSecret) {
      return 'PARTNER_WEBHOOK_URL is set but PARTNER_WEBHOOK_SECRET is not, so the webhook is switched off until both are set';
    }
    return null;
  }

  integrationStatus() {
    return {
      webhookConfigured: !!this.webhookUrl && !!this.webhookSecret,
      emailConfigured: this.emailRecipients.length > 0,
      partnerName: this.config.get<string>('PARTNER_NAME')?.trim() || null,
      configurationProblem: this.configurationProblem(),
    };
  }

  /** The channels that can really deliver right now (a webhook needs its secret). */
  private channels(): Channel[] {
    return [
      ...(this.webhookUrl && this.webhookSecret ? (['WEBHOOK'] as const) : []),
      ...(this.emailRecipients.length ? (['EMAIL'] as const) : []),
    ];
  }

  private hasAnyChannelConfigured() {
    return this.channels().length > 0 || !!this.configurationProblem();
  }

  /** The structured order summary, built fresh from the current records. */
  async payloadFor(orderId: string): Promise<PartnerOrderPayload> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: PARTNER_ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Order not found');
    const live = await this.prisma.order.count({
      where: { prescriptionId: order.prescriptionId, status: { not: OrderStatus.CANCELLED } },
    });
    return buildPartnerPayload(order, live);
  }

  /** Why this order can't go to the partner right now, or null when it can. */
  private async blocker(orderId: string): Promise<string | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { patient: true, prescription: true },
    });
    if (!order) return 'Order not found';
    if (order.status !== OrderStatus.PENDING) return 'The order is no longer waiting to be dispatched';
    if (order.prescription.status !== PrescriptionStatus.ACTIVE) return 'The prescription is no longer active';
    if (order.prescription.validUntil && order.prescription.validUntil < new Date()) return 'The prescription has expired';
    const p = order.patient;
    if (p.subscriptionEndedAt) return 'The patient’s subscription has ended';
    if (!p.addressLine1 || !p.city || !p.postcode || !p.country) return 'The patient has no complete delivery address on file';
    return null;
  }

  /**
   * Sends (or resends) the current message for one order — the order itself, or its cancellation.
   * Only the channels that have not yet accepted it are tried again. `force` is for a person
   * pressing "Send": it also resends a message that already went through.
   *
   * The order is claimed before anything leaves the platform, so two senders (the request that
   * created the order, the scheduled sweep, a person pressing the button) can't deliver the same
   * message twice; the loser gets a ConflictException. A claim a crashed worker left behind expires.
   */
  async send(orderId: string, opts: { actorId?: string; force?: boolean; timeoutMs?: number } = {}) {
    const channels = this.channels();
    const problem = this.configurationProblem();
    if (channels.length === 0 && !problem) {
      throw new BadRequestException('No partner channel is set up. Set PARTNER_WEBHOOK_URL (with PARTNER_WEBHOOK_SECRET) or PARTNER_ORDER_EMAIL, or copy the payload by hand.');
    }
    if (channels.length === 0) throw new BadRequestException(problem!);

    let row = await this.prisma.partnerTransmission.findUnique({ where: { orderId } });
    const cancelling = row?.event === CANCELLED;
    let message: PartnerMessage;
    if (cancelling) {
      message = row!.payload as unknown as PartnerCancelPayload;
    } else {
      const blocked = await this.blocker(orderId);
      if (blocked) throw new BadRequestException(blocked);
      message = await this.payloadFor(orderId);
      // Makes sure the record exists to claim; losing the race to create it is fine.
      await this.prisma.partnerTransmission.createMany({
        data: [{ orderId, event: CREATED, payload: message as unknown as Prisma.InputJsonValue, channels: [], targets: [] }],
        skipDuplicates: true,
      });
      row = await this.prisma.partnerTransmission.findUnique({ where: { orderId } });
      if (row && row.event === CANCELLED) throw new ConflictException('This order was cancelled while it was being sent');
    }
    if (!row) throw new NotFoundException('Order not found');

    const wanted = (row.targets.length ? row.targets : [...channels, ...(problem ? ['WEBHOOK'] : [])]) as string[];
    const alreadyDone = opts.force ? [] : row.channels;
    const todo = wanted.filter((c) => !alreadyDone.includes(c));
    if (todo.length === 0) return row;

    // Claim it: only one sender at a time gets past this point.
    const claimedAt = new Date();
    const claim = await this.prisma.partnerTransmission.updateMany({
      where: { orderId, event: row.event, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(claimedAt.getTime() - CLAIM_TTL_MS) } }] },
      data: { claimedAt },
    });
    if (claim.count === 0) throw new ConflictException('This order is already being sent — try again in a moment');

    // What the winner of an earlier round may have recorded in the meantime.
    const fresh = (await this.prisma.partnerTransmission.findUnique({ where: { orderId } })) ?? row;
    const done = opts.force ? [] : fresh.channels;
    const succeeded = new Set<string>(done.filter((c) => wanted.includes(c)));
    const errors: string[] = [];
    const body = JSON.stringify(message);

    for (const channel of wanted.filter((c) => !succeeded.has(c))) {
      try {
        if (channel === 'WEBHOOK') {
          if (!channels.includes('WEBHOOK')) throw new Error(problem ?? 'The webhook is no longer configured');
          await this.postWebhook(body, message, opts.timeoutMs ?? BACKGROUND_TIMEOUT_MS);
        } else if (channel === 'EMAIL') {
          if (!channels.includes('EMAIL')) throw new Error('The partner email address is no longer configured');
          await this.sendEmail(message);
        }
        succeeded.add(channel);
        // Remember it straight away: a crash after this must not send it to this channel again.
        await this.prisma.partnerTransmission.updateMany({ where: { orderId, claimedAt }, data: { channels: [...succeeded] } });
      } catch (err: any) {
        errors.push(`${channel}: ${err?.message ?? String(err)}`);
      }
    }

    const ok = errors.length === 0 && wanted.every((c) => succeeded.has(c));
    const attempts = fresh.attempts + 1;
    const settled = await this.prisma.partnerTransmission.updateMany({
      // Only if this sender still holds the claim (a cancellation or a takeover clears it).
      where: { orderId, claimedAt },
      data: {
        status: ok ? 'SENT' : 'FAILED',
        channels: [...succeeded],
        attempts,
        lastError: errors.length ? errors.join(' · ').slice(0, 500) : null,
        lastAttemptAt: new Date(),
        nextAttemptAt: ok ? null : new Date(Date.now() + retryDelayMinutes(attempts) * 60_000),
        sentAt: ok ? new Date() : fresh.sentAt,
        claimedAt: null,
        ...(cancelling ? {} : { payload: message as unknown as Prisma.InputJsonValue }),
      },
    });

    if (settled.count === 0) {
      this.logger.warn(`Order ${orderId}: the send claim was lost while delivering; leaving the record as the other writer left it`);
    } else {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { patientId: true } });
      await this.audit.log({
        actorId: opts.actorId ?? 'system:partner-orders',
        actorRole: opts.actorId ? UserRole.CLINICIAN : UserRole.ADMIN,
        action: cancelling
          ? ok ? 'ORDER_CANCELLATION_SENT_TO_PARTNER' : 'ORDER_CANCELLATION_PARTNER_SEND_FAILED'
          : ok ? 'ORDER_SENT_TO_PARTNER' : 'ORDER_PARTNER_SEND_FAILED',
        resourceType: 'Order',
        resourceId: orderId,
        patientId: order?.patientId,
        metadata: { channels: [...succeeded], attempts, error: errors.length ? errors.join(' · ').slice(0, 500) : null },
      });
      if (!ok) this.logger.warn(`Order ${orderId} not fully delivered to the partner (${row.event}): ${errors.join(' · ')}`);
    }
    return (await this.prisma.partnerTransmission.findUnique({ where: { orderId } }))!;
  }

  /** Best-effort send for right after an order is created. Never throws: the order stands either way. */
  async trySend(orderId: string): Promise<void> {
    if (!this.hasAnyChannelConfigured()) return;
    try {
      const done = await this.prisma.partnerTransmission.findUnique({ where: { orderId }, select: { status: true, event: true } });
      if (done?.event === CANCELLED || done?.status === 'SENT') return;
      if (await this.blocker(orderId)) return;
      await this.send(orderId, { timeoutMs: INLINE_TIMEOUT_MS });
    } catch (err: any) {
      if (err instanceof ConflictException) return; // someone else is already sending it
      this.logger.warn(`Automatic send of order ${orderId} failed: ${err?.message ?? err}`);
    }
  }

  /** The first supply of a prescription, which is what approving a consultation creates. */
  async trySendForPrescription(prescriptionId: string): Promise<void> {
    // Issuing a prescription may have withdrawn the one it replaces; tell the partner too.
    await this.flushCancellations();
    const order = await this.prisma.order.findFirst({ where: { prescriptionId, sequence: 1 }, select: { id: true } });
    if (order) await this.trySend(order.id);
  }

  /**
   * Records, in the caller's transaction, that these orders were withdrawn: every one the partner
   * has (or may have) been given is switched to an "order.cancelled" message to deliver. Nothing
   * is sent here — call flushCancellations() after the transaction commits; the sweep is the net.
   */
  async markCancelled(orderIds: string[], db: Db = this.prisma): Promise<void> {
    for (const orderId of orderIds) {
      const [order, tx] = await Promise.all([
        db.order.findUnique({ where: { id: orderId }, select: { id: true, cancelledAt: true, cancelReason: true } }),
        db.partnerTransmission.findUnique({ where: { orderId } }),
      ]);
      if (!order || !tx || tx.event === CANCELLED) continue;
      const inFlight = !!tx.claimedAt && Date.now() - tx.claimedAt.getTime() < CLAIM_TTL_MS;
      // Never attempted and nobody is sending it now: the partner has never heard of this order.
      if (tx.attempts === 0 && !inFlight) continue;
      await db.partnerTransmission.update({
        where: { orderId },
        data: {
          event: CANCELLED,
          status: 'PENDING',
          // Tell exactly the channels that took the order; if unsure (a timeout may still have landed) tell all.
          targets: inFlight ? [] : tx.channels,
          channels: [],
          attempts: 0,
          lastError: null,
          lastAttemptAt: null,
          nextAttemptAt: null,
          claimedAt: null,
          sentAt: null,
          payload: buildCancelPayload(order) as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  /** Delivers cancellation messages that are waiting. Best effort; never throws. */
  async flushCancellations(limit = 10): Promise<void> {
    if (!this.hasAnyChannelConfigured()) return;
    try {
      const waiting = await this.prisma.partnerTransmission.findMany({
        where: { event: CANCELLED, status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: MAX_AUTOMATIC_ATTEMPTS }, AND: [this.dueClause(new Date())] },
        select: { orderId: true },
        orderBy: { updatedAt: 'asc' },
        take: limit,
      });
      for (const { orderId } of waiting) {
        try {
          await this.send(orderId, { timeoutMs: INLINE_TIMEOUT_MS });
        } catch (err: any) {
          if (!(err instanceof ConflictException)) this.logger.warn(`Cancellation of order ${orderId} not sent: ${err?.message ?? err}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not check for waiting cancellations: ${err?.message ?? err}`);
    }
  }

  /** Not waiting out a back-off, and not being sent by someone right now. */
  private dueClause(now: Date): Prisma.PartnerTransmissionWhereInput {
    return {
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - CLAIM_TTL_MS) } }] },
      ],
    };
  }

  /**
   * Run on a schedule: delivers cancellations first, then retries what failed and picks up orders
   * nobody has sent (e.g. the partner channel was set up after they were created). Everything the
   * query returns is something that can actually be sent now, so rows that never can be sent
   * (expired prescription, no address, exhausted retries) can't crowd newer orders out.
   */
  async sweep(limit = 20): Promise<{ attempted: number; sent: number; failed: number; skipped: number }> {
    const totals = { attempted: 0, sent: 0, failed: 0, skipped: 0 };
    if (!this.hasAnyChannelConfigured()) return totals;

    const now = new Date();
    const due = this.dueClause(now);
    const pending = ['PENDING', 'FAILED'] as ('PENDING' | 'FAILED')[];

    const cancellations = await this.prisma.partnerTransmission.findMany({
      where: { event: CANCELLED, status: { in: pending }, attempts: { lt: MAX_AUTOMATIC_ATTEMPTS }, ...due },
      select: { orderId: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });

    const filled = { not: null } as const;
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        createdAt: { lt: new Date(now.getTime() - SWEEP_GRACE_MS) },
        prescription: { status: PrescriptionStatus.ACTIVE, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        patient: {
          subscriptionEndedAt: null,
          addressLine1: filled,
          city: filled,
          postcode: filled,
          country: filled,
          NOT: [{ addressLine1: '' }, { city: '' }, { postcode: '' }, { country: '' }],
        },
        OR: [
          { partnerTransmission: null },
          { partnerTransmission: { event: CREATED, status: { in: pending }, attempts: { lt: MAX_AUTOMATIC_ATTEMPTS }, ...due } },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const { orderId } of cancellations) await this.sweepOne(orderId, totals);
    for (const { id } of orders) await this.sweepOne(id, totals);
    return totals;
  }

  private async sweepOne(orderId: string, totals: { attempted: number; sent: number; failed: number; skipped: number }) {
    totals.attempted++;
    try {
      const result = await this.send(orderId);
      if (result.status === 'SENT') totals.sent++;
      else totals.failed++;
    } catch (err: any) {
      // Someone else is sending it, or it stopped being sendable since the query: not a delivery failure.
      if (err instanceof ConflictException || err instanceof BadRequestException) {
        totals.skipped++;
        return;
      }
      totals.failed++;
      this.logger.warn(`Sweep could not send order ${orderId}: ${err?.message ?? err}`);
    }
  }

  private async postWebhook(body: string, message: PartnerMessage, timeoutMs: number) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const secret = this.webhookSecret;
    if (!secret) throw new Error(this.configurationProblem() ?? 'PARTNER_WEBHOOK_SECRET is not set'); // never post unsigned
    const res = await fetch(this.webhookUrl!, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telehealth-event': message.event,
        'x-telehealth-timestamp': timestamp,
        // The same message always carries the same key, so a retry can't act twice at the partner;
        // the cancellation has its own key so it isn't mistaken for a repeat of the order.
        'idempotency-key': message.event === CANCELLED ? `${message.orderId}:cancelled` : message.orderId,
        'x-telehealth-signature': signPartnerBody(body, secret, timestamp),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Partner answered ${res.status}`);
  }

  private async sendEmail(message: PartnerMessage) {
    // Email carries a ping only (no patient details, no attachment); the webhook is the channel for the full order.
    const { subject, html } =
      message.event === CANCELLED
        ? partnerCancelEmailSummary(message)
        : partnerPingSummary({ reference: message.reference, requiresColdChain: message.prescription.requiresColdChain }, this.config.get<string>('CLINICIAN_APP_URL')?.trim());
    const delivered = await this.email.sendPartnerOrderEmail(this.emailRecipients, subject, html);
    if (!delivered) throw new Error('Email provider is not configured');
  }
}
