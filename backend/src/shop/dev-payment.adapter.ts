import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopPaymentProvider } from '@prisma/client';
import type { PaymentStart, PaymentStartInput, PaymentState, ShopPaymentAdapter } from './payment-provider';

/**
 * A pretend payment for trying the shop locally without bank or Stripe credentials. The "payment page" is the
 * website's /shop/test-payment, whose buttons call POST /api/shop/dev/complete. Never offered in production.
 */
@Injectable()
export class DevPaymentAdapter implements ShopPaymentAdapter {
  readonly key = ShopPaymentProvider.DEV;
  readonly kind = 'CARD' as const;
  readonly label = 'Test payment';
  readonly description = 'Local testing only: no money moves';

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'production';
  }

  async start(input: PaymentStartInput): Promise<PaymentStart> {
    const site = (this.config.get<string>('WEBFLOW_SITE_URL') ?? 'http://localhost:3001').replace(/\/$/, '');
    const query = new URLSearchParams({ payment: input.paymentId, amount: String(input.amountCents), currency: input.currency, success: input.urls.success, fail: input.urls.fail, cancel: input.urls.cancel });
    return { providerOrderId: `dev-${input.paymentId}`, redirectUrl: `${site}/shop/test-payment?${query}` };
  }

  // The test page records the outcome itself; asking "the provider" never changes anything.
  async status(): Promise<PaymentState> {
    return { status: 'PENDING' };
  }

  async refund(payment: { providerOrderId: string }): Promise<string> {
    return `dev-refund-${payment.providerOrderId}-${Date.now()}`;
  }
}
