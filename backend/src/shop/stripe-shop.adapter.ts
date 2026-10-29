import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopPaymentProvider } from '@prisma/client';
import Stripe from 'stripe';
import { PaymentProviderError, type PaymentStart, type PaymentStartInput, type PaymentState, type ShopPaymentAdapter } from './payment-provider';

/** Marks a Checkout Session as a shop payment, so the subscription webhook hands it to the shop (see stripe-webhook.service.ts). */
export const SHOP_SESSION_KIND = 'shop';

/**
 * Shop payments through Stripe Checkout: a one-off payment on Stripe's own page, on the same Stripe account as the
 * subscriptions but with none of their code. A completed session arrives on the existing webhook, which passes it here
 * by its metadata; the session is then read back from Stripe before the order counts as paid.
 */
@Injectable()
export class StripeShopAdapter implements ShopPaymentAdapter {
  readonly key = ShopPaymentProvider.STRIPE;
  readonly kind = 'CARD' as const;
  readonly label = 'Pay with Stripe';
  readonly description = 'Visa, Mastercard and other cards, through Stripe';

  private readonly stripe: Stripe | null;

  constructor(private config: ConfigService) {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = key ? new Stripe(key, { apiVersion: '2023-10-16' as any }) : null;
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  async start(input: PaymentStartInput): Promise<PaymentStart> {
    const stripe = this.client();
    const metadata = { kind: SHOP_SESSION_KIND, shopPaymentId: input.paymentId, shopReference: input.merchantReference };
    try {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer_email: input.buyer.email,
          client_reference_id: input.merchantReference,
          line_items: input.items.map((i) => ({
            quantity: i.quantity,
            price_data: { currency: input.currency, unit_amount: i.unitPriceCents, product_data: { name: i.name } },
          })),
          metadata,
          payment_intent_data: { metadata, description: input.description },
          success_url: input.urls.success,
          cancel_url: input.urls.cancel,
          // Stripe's shortest allowed lifetime; the order's own hold on the stock is about as long.
          expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        },
        // A retried request for the same try must not open a second session.
        { idempotencyKey: `shop-${input.merchantReference}` },
      );
      if (!session.url) throw new PaymentProviderError('Stripe returned no payment page');
      return { providerOrderId: session.id, redirectUrl: session.url };
    } catch (err: any) {
      if (err instanceof PaymentProviderError) throw err;
      throw new PaymentProviderError(`Stripe could not open a checkout: ${err?.message}`, err?.statusCode);
    }
  }

  async status(providerOrderId: string): Promise<PaymentState> {
    let session: Stripe.Checkout.Session;
    try {
      session = await this.client().checkout.sessions.retrieve(providerOrderId, { expand: ['payment_intent.latest_charge'] });
    } catch (err: any) {
      throw new PaymentProviderError(`Stripe could not be read: ${err?.message}`, err?.statusCode);
    }
    const intent = typeof session.payment_intent === 'object' ? session.payment_intent : null;
    const base: PaymentState = {
      status: 'PENDING',
      amountCents: session.amount_total ?? undefined,
      currency: session.currency ?? undefined,
      merchantReference: session.client_reference_id ?? undefined,
      transactionId: intent?.id ?? (typeof session.payment_intent === 'string' ? session.payment_intent : undefined),
    };
    if (session.payment_status === 'paid') {
      const card = (intent?.latest_charge as Stripe.Charge | null | undefined)?.payment_method_details?.card;
      return { ...base, status: 'SUCCEEDED', cardSummary: card?.last4 ? `${card.brand.toUpperCase()} ···· ${card.last4}` : undefined };
    }
    if (session.status === 'expired') return { ...base, status: 'CANCELLED' };
    const error = intent?.last_payment_error;
    if (error) return { ...base, failureCode: error.decline_code ?? error.code, failureMessage: 'Your bank declined the payment. Please try again or use another card.' };
    return base;
  }

  async refund(payment: { providerTransactionId: string }, amountCents: number): Promise<string> {
    try {
      const refund = await this.client().refunds.create({ payment_intent: payment.providerTransactionId, amount: amountCents });
      return refund.id;
    } catch (err: any) {
      throw new PaymentProviderError(`Stripe refused the refund: ${err?.message}`, err?.statusCode);
    }
  }

  private client(): Stripe {
    if (!this.stripe) throw new PaymentProviderError('Stripe is not set up: STRIPE_SECRET_KEY is missing');
    return this.stripe;
  }
}
