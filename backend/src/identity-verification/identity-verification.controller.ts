import { Controller, Headers, HttpCode, Logger, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { BadRequestException, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IdentityVerificationStatus } from '../common/enums';
import { IdentityVerificationService, UnknownSessionError, VerifyWebhookPayload } from './identity-verification.service';
import { verifyWebhookSignature } from './webhook-signature';

const asString = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null);

function asDate(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Validates the body after the signature check. Returns null for anything we can't act on. */
function parsePayload(body: unknown): VerifyWebhookPayload | 'ignored' | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, any>;
  // Other event types may be added later; acknowledge them so they are not retried for a day.
  if (b.type !== 'session.status_changed') return 'ignored';

  const eventId = asString(b.eventId);
  const sessionId = asString(b.sessionId);
  const occurredAt = asDate(b.occurredAt);
  if (!eventId || !sessionId || !occurredAt) return null;
  if (!Object.values(IdentityVerificationStatus).includes(b.status)) return null;

  const review = b.review && typeof b.review === 'object' ? b.review : null;
  return {
    eventId,
    sessionId,
    status: b.status,
    occurredAt,
    review: review
      ? {
          reason: typeof review.reason === 'string' ? review.reason.slice(0, 1000) : null,
          decidedAt: asDate(review.decidedAt),
        }
      : null,
  };
}

/** Receives results from verify-service. Never logs the body: it concerns a person's identity check. */
@Controller('verify')
export class IdentityVerificationController {
  private readonly logger = new Logger(IdentityVerificationController.name);

  constructor(
    private config: ConfigService,
    private service: IdentityVerificationService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-verify-signature') signature: string | undefined,
  ) {
    const secret = this.config.get<string>('VERIFY_WEBHOOK_SECRET') ?? '';
    if (!secret) {
      this.logger.error('VERIFY_WEBHOOK_SECRET is not set: rejecting identity webhooks');
      throw new ServiceUnavailableException('Webhook secret not configured');
    }
    // The signature covers the exact bytes sent, so it must be checked against the raw body.
    if (!req.rawBody) throw new BadRequestException('Missing raw body');
    if (!verifyWebhookSignature({ rawBody: req.rawBody, header: signature, secret })) {
      throw new BadRequestException('Invalid signature');
    }

    const payload = parsePayload(req.body);
    if (payload === 'ignored') return { received: true };
    if (!payload) throw new BadRequestException('Invalid payload');

    try {
      await this.service.handleWebhook(payload);
    } catch (err) {
      if (err instanceof UnknownSessionError) {
        // Usually the session row is still being written: answer with an error so it's sent again.
        this.logger.warn(`Identity webhook ${payload.eventId} is for a session not stored yet: asking for a retry`);
        throw new ServiceUnavailableException('Session not known yet');
      }
      // 5xx makes verify-service retry; the event id is only recorded if processing succeeded.
      this.logger.error(`Could not process identity webhook ${payload.eventId}: ${(err as Error).message}`);
      throw new InternalServerErrorException('Could not process the event');
    }
    return { received: true };
  }
}
