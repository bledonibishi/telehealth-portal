import { Controller, Post, Req, Res, Headers, Logger, type RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import Stripe from 'stripe';
import { StripeWebhookService } from './stripe-webhook.service';

@Controller('stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(
    private config: ConfigService,
    private webhookService: StripeWebhookService,
  ) {
    this.stripe = new Stripe(config.get<string>('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16' as any,
    });
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('stripe-signature') sig: string,
  ) {
    if (!this.webhookSecret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not set — skipping signature check');
      return res.status(400).send('Webhook secret not configured');
    }

    // Stripe signs the exact bytes it sent. req.body is already parsed JSON by
    // now, so verify against the raw body Nest keeps (see rawBody in create-app.ts).
    if (!req.rawBody) {
      this.logger.error('Webhook request has no raw body — cannot verify the signature');
      return res.status(400).send('Webhook Error: missing raw body');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(req.rawBody, sig, this.webhookSecret);
    } catch (err: any) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      await this.webhookService.handle(event);
    } catch (err: any) {
      this.logger.error(`Webhook handler error: ${err.message}`);
      return res.status(500).send('Internal error');
    }

    res.status(200).json({ received: true });
  }
}
