import { Controller, Headers, HttpCode, Logger, Post, Req, UnauthorizedException, type RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { BookingService } from '../booking.service';
import { parseCalcomEvent, verifyCalcomSignature } from './calcom-webhook';

/**
 * Where Cal.com tells us a booking was made, moved, cancelled or finished.
 *   CALCOM_WEBHOOK_SECRET  the secret set on the webhook in Cal.com; without it every message is refused
 * In Cal.com: Settings → Developer → Webhooks → subscriber URL  <API>/booking/webhooks/calcom
 */
@SkipThrottle()
@Controller('booking/webhooks')
export class CalcomWebhookController {
  private readonly logger = new Logger(CalcomWebhookController.name);

  constructor(
    private config: ConfigService,
    private bookings: BookingService,
  ) {}

  @Post('calcom')
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Headers('x-cal-signature-256') signature?: string) {
    const secret = this.config.get<string>('CALCOM_WEBHOOK_SECRET')?.trim() ?? '';
    // Verified against the raw bytes Nest keeps (see rawBody in create-app.ts), not the re-serialised JSON.
    if (!secret || !req.rawBody || !verifyCalcomSignature(req.rawBody, signature, secret)) {
      this.logger.warn(secret ? 'Cal.com webhook with a bad or missing signature — refused' : 'CALCOM_WEBHOOK_SECRET not set — webhook refused');
      throw new UnauthorizedException();
    }
    const event = parseCalcomEvent(req.body);
    if (!event) return { received: true, applied: false };
    const booking = await this.bookings.applyProviderEvent(event);
    return { received: true, applied: !!booking };
  }
}
