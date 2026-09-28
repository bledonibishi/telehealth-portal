import { Controller, Post, Body } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

// Public — the Webflow checkout page (data-th-pay) calls these directly.
// See website/webflow/live-site-scripts-embed.html for the exact request shapes.
@Controller('api/checkout')
export class CheckoutController {
  constructor(private checkout: CheckoutService) {}

  @Post()
  createHostedSession(@Body() body: { priceId?: string; planName?: string; leadId?: string }) {
    return this.checkout.createHostedSession(body);
  }

  @Post('stripe-intent')
  createSubscriptionIntent(
    @Body() body: { priceId?: string; planName?: string; email?: string; leadId?: string; medication?: string },
  ) {
    return this.checkout.createSubscriptionIntent(body);
  }
}
