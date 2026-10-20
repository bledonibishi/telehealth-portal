import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { CheckoutService, type ShippingInput } from './checkout.service';
import { DosePricingService } from '../stripe/dose-pricing.service';
import { ConfigService } from '@nestjs/config';
import { PRESCRIPTION_FEE_CURRENCY, prescriptionFeeCents } from '../stripe/prescription-fee';

// Public — the website's checkout page (website/src/app/checkout) and success
// page call these directly.
@Controller('api/checkout')
export class CheckoutController {
  constructor(
    private checkout: CheckoutService,
    private dosePricing: DosePricingService,
    private config: ConfigService,
  ) {}

  @Post()
  createHostedSession(
    @Body() body: { priceId?: string; planName?: string; leadId?: string; email?: string; product?: string; dose?: string; addProgesterone?: boolean; applyReward?: boolean; shipping?: ShippingInput },
  ) {
    return this.checkout.createHostedSession(body);
  }

  @Post('stripe-intent')
  createSubscriptionIntent(
    @Body()
    body: { priceId?: string; planName?: string; leadId?: string; medication?: string; product?: string; dose?: string; addProgesterone?: boolean; applyReward?: boolean; shipping?: ShippingInput; billing?: 'ONE_TIME' | 'SUBSCRIPTION' },
  ) {
    return this.checkout.createSubscriptionIntent(body);
  }

  @Post('details')
  saveShipping(@Body() body: { leadId?: string; shipping?: ShippingInput }) {
    return this.checkout.saveShipping(body);
  }

  /** Each dose's own monthly price, for the product picker. Doses not listed use their plan price. */
  @Get('prices')
  prices() {
    return this.dosePricing.publicPrices();
  }

  /** The doctor's prescription fee, shown as its own line before paying. Amount 0 means there is none. */
  @Get('fee')
  fee() {
    return { amountCents: prescriptionFeeCents(this.config), currency: PRESCRIPTION_FEE_CURRENCY };
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
