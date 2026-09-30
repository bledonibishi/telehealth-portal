import { BadRequestException, Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeWebhookService } from './stripe-webhook.service';

// Display-only copy mirroring website/webflow/live-site-scripts-embed.html's
// CONFIG.PLANS, so the local test-checkout page can show a real plan picker
// instead of a blank price-id box. The actual price/currency lives in Stripe
// itself against the priceId — this label is just what the quiz shows.
const PLAN_LABELS = [
  { key: 'HRT_STARTER', envVar: 'STRIPE_PRICE_HRT_STARTER', name: 'HRT Starter', desc: 'Estradiol gel 0.1%', priceLabel: '£49' },
  { key: 'HRT_COMPLETE', envVar: 'STRIPE_PRICE_HRT_COMPLETE', name: 'HRT Complete', desc: 'Estradiol gel + micronised progesterone', priceLabel: '£79' },
  { key: 'GLP1_STARTER', envVar: 'STRIPE_PRICE_GLP1_STARTER', name: 'GLP-1 Starter', desc: 'Semaglutide 0.25 mg → 0.5 mg titration', priceLabel: '£149' },
  { key: 'GLP1_ADVANCED', envVar: 'STRIPE_PRICE_GLP1_ADVANCED', name: 'GLP-1 Advanced', desc: 'Semaglutide 1 mg maintenance', priceLabel: '£199' },
] as const;

// Local testing only — lets website/src/app/test-checkout simulate a
// successful payment without going through a real payment processor. Useful
// for exercising the referral/voucher system against a processor that isn't
// actually integrated yet (Paysera) without needing real credentials.
// Feeds the same Stripe.Event shape stripe-webhook.service.ts already
// handles, so this isn't a second activation code path to keep in sync —
// it's the real one, just triggered by a fake event instead of a real payment.
@Controller('internal/dev')
export class DevPaymentSimulatorController {
  constructor(
    private config: ConfigService,
    private stripeWebhook: StripeWebhookService,
  ) {}

  // Non-secret — a Stripe Price id isn't sensitive, so this is safe to expose
  // to the local test page without auth. Lets it show a real plan picker
  // (name + price) instead of asking you to dig a price id out of Stripe.
  @Get('plans')
  plans() {
    return PLAN_LABELS.map((p) => ({
      key: p.key,
      name: p.name,
      desc: p.desc,
      priceLabel: p.priceLabel,
      priceId: this.config.get<string>(p.envVar) ?? null,
    }));
  }

  @Post('simulate-payment')
  async simulatePayment(@Body() body: { email?: string }) {
    if (this.config.get<string>('NODE_ENV') === 'production') throw new ForbiddenException('Not available in production');
    if (!body.email) throw new BadRequestException('Missing email');

    const fakeSession = {
      id: `mock_session_${Date.now()}`,
      customer_details: { email: body.email },
      customer: null,
      subscription: null,
    } as unknown as Stripe.Checkout.Session;

    await this.stripeWebhook.handle({ type: 'checkout.session.completed', data: { object: fakeSession } } as Stripe.Event);
    return { ok: true };
  }
}
