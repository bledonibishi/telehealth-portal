import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { CheckoutService, type ShippingInput } from './checkout.service';

// Public — the website's checkout page (website/src/app/checkout) and success
// page call these directly.
@Controller('api/checkout')
export class CheckoutController {
  constructor(private checkout: CheckoutService) {}

  @Post()
  createHostedSession(
    @Body() body: { priceId?: string; planName?: string; leadId?: string; email?: string; product?: string; dose?: string; applyReward?: boolean; shipping?: ShippingInput },
  ) {
    return this.checkout.createHostedSession(body);
  }

  @Post('stripe-intent')
  createSubscriptionIntent(
    @Body()
    body: { priceId?: string; planName?: string; email?: string; leadId?: string; medication?: string; product?: string; dose?: string; applyReward?: boolean; shipping?: ShippingInput },
  ) {
    return this.checkout.createSubscriptionIntent(body);
  }

  @Post('details')
  saveShipping(@Body() body: { leadId?: string; email?: string; shipping?: ShippingInput }) {
    return this.checkout.saveShipping(body);
  }

  @Get('rewards')
  rewards(@Query('leadId') leadId?: string) {
    return this.checkout.rewardsFor(leadId);
  }

  @Get('success-info')
  successInfo(@Query('session_id') sessionId?: string, @Query('payment_intent') paymentIntentId?: string) {
    return this.checkout.successInfo({ sessionId, paymentIntentId });
  }
}
