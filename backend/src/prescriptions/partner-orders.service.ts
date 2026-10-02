import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { OrderStatus, PrescriptionStatus, UserRole } from '../common/enums';
import {
  PARTNER_ORDER_INCLUDE,
  buildPartnerPayload,
  partnerEmailSummary,
  signPartnerBody,
  type PartnerOrderPayload,
} from './partner-payload';

type Channel = 'WEBHOOK' | 'EMAIL';

/** Give up on automatic retries after this many attempts; a person can still resend by hand. */
export const MAX_AUTOMATIC_ATTEMPTS = 8;
const INLINE_TIMEOUT_MS = 5_000;
const BACKGROUND_TIMEOUT_MS = 10_000;
/** A brand-new order is left alone for a moment so the request that created it can send it first. */
const SWEEP_GRACE_MS = 60_000;

/** Minutes to wait before the next automatic retry: 5, 10, 20 … capped at 4 hours. */
export const retryDelayMinutes = (attempts: number) => Math.min(5 * 2 ** Math.max(attempts - 1, 0), 240);

/**
 * Passes each new pharmacy order on to the external partner pharmacy as a structured, signed
 * message — by webhook, by email, or both, depending on what is configured:
 *   PARTNER_WEBHOOK_URL (+ PARTNER_WEBHOOK_SECRET)   POST of the JSON payload
 *   PARTNER_ORDER_EMAIL                              comma-separated recipients
 * Nothing leaves the platform unless one of them is set. The payload can always be viewed
 * and copied from the Orders page, which is also how a partner without an API is served.
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

  integrationStatus() {
    return {
      webhookConfigured: !!this.webhookUrl,
      emailConfigured: this.emailRecipients.length > 0,
      partnerName: this.config.get<string>('PARTNER_NAME')?.trim() || null,
    };
  }

  private channels(): Channel[] {
    return [...(this.webhookUrl ? (['WEBHOOK'] as const) : []), ...(this.emailRecipients.length ? (['EMAIL'] as const) : [])];
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
    if (!p.addressLine1 || !p.city || !p.postcode || !p.country) return 'The patient has no complete delivery address on file';
    return null;
  }

  /**
   * Sends (or resends) one order. Only the channels that have not yet accepted it are tried again.
   * `force` is for a person pressing "Send": it also resends an order that already went through.
   */
  async send(orderId: string, opts: { actorId?: string; force?: boolean; timeoutMs?: number } = {}) {
    const channels = this.channels();
    if (channels.length === 0) {
      throw new BadRequestException('No partner channel is set up. Set PARTNER_WEBHOOK_URL or PARTNER_ORDER_EMAIL, or copy the payload by hand.');
    }
    const blocked = await this.blocker(orderId);
    if (blocked) throw new BadRequestException(blocked);

    const payload = await this.payloadFor(orderId);
    const existing = await this.prisma.partnerTransmission.findUnique({ where: { orderId } });
    const alreadyDone = opts.force ? [] : (existing?.channels ?? []);
    const todo = channels.filter((c) => !alreadyDone.includes(c));

    if (todo.length === 0) return existing!;

    const body = JSON.stringify(payload);
    const errors: string[] = [];
    const succeeded = new Set<string>(alreadyDone.filter((c) => channels.includes(c as Channel)));
    for (const channel of todo) {
      try {
        if (channel === 'WEBHOOK') await this.postWebhook(body, orderId, opts.timeoutMs ?? BACKGROUND_TIMEOUT_MS);
        else await this.sendEmail(payload);
        succeeded.add(channel);
      } catch (err: any) {
        errors.push(`${channel}: ${err?.message ?? String(err)}`);
      }
    }

    const ok = errors.length === 0 && channels.every((c) => succeeded.has(c));
    const data = {
      status: ok ? ('SENT' as const) : ('FAILED' as const),
      channels: [...succeeded],
      attempts: (existing?.attempts ?? 0) + 1,
      lastError: errors.length ? errors.join(' · ').slice(0, 500) : null,
      lastAttemptAt: new Date(),
      sentAt: ok ? new Date() : (existing?.sentAt ?? null),
      payload: payload as unknown as Prisma.InputJsonValue,
    };
    const saved = await this.prisma.partnerTransmission.upsert({
      where: { orderId },
      create: { orderId, ...data },
      update: data,
    });

    await this.audit.log({
      actorId: opts.actorId ?? 'system:partner-orders',
      actorRole: opts.actorId ? UserRole.CLINICIAN : UserRole.ADMIN,
      action: ok ? 'ORDER_SENT_TO_PARTNER' : 'ORDER_PARTNER_SEND_FAILED',
      resourceType: 'Order',
      resourceId: orderId,
      metadata: { channels: [...succeeded], attempts: saved.attempts, error: data.lastError },
    });
    if (!ok) this.logger.warn(`Order ${orderId} not fully delivered to the partner: ${data.lastError}`);
    return saved;
  }

  /** Best-effort send for right after an order is created. Never throws: the order stands either way. */
  async trySend(orderId: string): Promise<void> {
    if (this.channels().length === 0) return;
    try {
      const done = await this.prisma.partnerTransmission.findUnique({ where: { orderId }, select: { status: true } });
      if (done?.status === 'SENT') return;
      if (await this.blocker(orderId)) return;
      await this.send(orderId, { timeoutMs: INLINE_TIMEOUT_MS });
    } catch (err: any) {
      this.logger.warn(`Automatic send of order ${orderId} failed: ${err?.message ?? err}`);
    }
  }

  /** The first supply of a prescription, which is what approving a consultation creates. */
  async trySendForPrescription(prescriptionId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({ where: { prescriptionId, sequence: 1 }, select: { id: true } });
    if (order) await this.trySend(order.id);
  }

  /**
   * Run on a schedule: retries what failed and picks up orders nobody sent
   * (e.g. the partner channel was set up after they were created).
   */
  async sweep(limit = 20): Promise<{ attempted: number; sent: number; failed: number }> {
    if (this.channels().length === 0) return { attempted: 0, sent: 0, failed: 0 };

    const now = Date.now();
    const candidates = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        createdAt: { lt: new Date(now - SWEEP_GRACE_MS) },
        prescription: { status: PrescriptionStatus.ACTIVE },
        OR: [
          { partnerTransmission: null },
          { partnerTransmission: { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: MAX_AUTOMATIC_ATTEMPTS } } },
        ],
      },
      include: { partnerTransmission: { select: { attempts: true, lastAttemptAt: true } } },
      orderBy: { createdAt: 'asc' },
      take: limit * 3,
    });

    const due = candidates
      .filter((o) => {
        const t = o.partnerTransmission;
        if (!t?.lastAttemptAt) return true;
        return now - t.lastAttemptAt.getTime() >= retryDelayMinutes(t.attempts) * 60_000;
      })
      .slice(0, limit);

    let sent = 0;
    let failed = 0;
    for (const order of due) {
      try {
        if (await this.blocker(order.id)) continue;
        const result = await this.send(order.id);
        if (result.status === 'SENT') sent++;
        else failed++;
      } catch (err: any) {
        failed++;
        this.logger.warn(`Sweep could not send order ${order.id}: ${err?.message ?? err}`);
      }
    }
    return { attempted: due.length, sent, failed };
  }

  private async postWebhook(body: string, orderId: string, timeoutMs: number) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const secret = this.webhookSecret;
    const res = await fetch(this.webhookUrl!, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telehealth-event': 'order.created',
        'x-telehealth-timestamp': timestamp,
        // The same order always carries the same key, so a retry can't create a second order at the partner.
        'idempotency-key': orderId,
        ...(secret && { 'x-telehealth-signature': signPartnerBody(body, secret, timestamp) }),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Partner answered ${res.status}`);
  }

  private async sendEmail(payload: PartnerOrderPayload) {
    const { subject, html } = partnerEmailSummary(payload);
    const delivered = await this.email.sendPartnerOrderEmail(this.emailRecipients, subject, html, JSON.stringify(payload, null, 2), `${payload.reference}.json`);
    if (!delivered) throw new Error('Email provider is not configured');
  }
}
