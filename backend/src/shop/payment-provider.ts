import type { ShopPaymentProvider } from '@prisma/client';

/** What a provider needs to open its payment page for one try at paying an order. */
export interface PaymentStartInput {
  /** Unique per try: "<order reference>-<attempt>". Providers refuse a number they have seen before. */
  merchantReference: string;
  amountCents: number;
  currency: string;
  description: string;
  items: Array<{ name: string; unitPriceCents: number; quantity: number }>;
  buyer: { email: string; firstName: string; lastName: string; phone?: string | null };
  address: ShopAddress;
  urls: {
    /** Where the buyer's browser goes after paying, failing or giving up. Never proof of payment. */
    success: string;
    fail: string;
    cancel: string;
    /** Where the provider tells our server something happened. A hint to look, never proof either. */
    notify: string;
  };
  /** Passed back by the providers that support it, so their notification can be matched to the try. */
  paymentId: string;
}

export interface ShopAddress {
  line1: string;
  city: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, e.g. XK. */
  country: string;
}

export interface PaymentStart {
  /** The provider's id for this try (RaiAccept order id, Stripe Checkout Session id). */
  providerOrderId: string;
  /** The provider's payment page. */
  redirectUrl: string;
}

/**
 * Where a try stands, as the provider reports it when we ask. This, and never a notification's body or the page
 * the buyer lands on, is what marks an order paid.
 */
export interface PaymentState {
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  /** What the provider says was charged. Checked against what we asked for before an order counts as paid. */
  amountCents?: number;
  currency?: string;
  /** The reference the provider holds for the try; checked against ours when the provider gives one back. */
  merchantReference?: string;
  /** The purchase itself, needed to refund it. */
  transactionId?: string;
  /** e.g. "VISA ···· 0011". */
  cardSummary?: string;
  failureCode?: string;
  /** Why it failed, written for the buyer. */
  failureMessage?: string;
}

/**
 * One way of paying in the shop. Adding a provider is one class listed in shop.module.ts: open its payment page,
 * say where a try stands, and refund. Everything else (prices, stock, checks, emails, receipts) is shared.
 */
export interface ShopPaymentAdapter {
  readonly key: ShopPaymentProvider;
  /**
   * CARD: paid online, the provider says when. OFFLINE: paid later by hand (to the courier, by bank transfer), and
   * staff record it; the provider is never asked and refunds are given back by hand.
   */
  readonly kind: 'CARD' | 'OFFLINE';
  /** Shown to the buyer when choosing how to pay. */
  readonly label: string;
  readonly description: string;
  /** Whether its credentials are set, so the buyer is only offered what works. */
  isConfigured(): boolean;
  start(input: PaymentStartInput): Promise<PaymentStart>;
  status(providerOrderId: string): Promise<PaymentState>;
  /** Gives back `amountCents` of a purchase. Returns the provider's id for the refund. */
  refund(payment: { providerOrderId: string; providerTransactionId: string; currency: string }, amountCents: number): Promise<string>;
}

/** Injection token for the list of providers. */
export const SHOP_PAYMENT_ADAPTERS = Symbol('SHOP_PAYMENT_ADAPTERS');

/** A provider could not be reached or refused the request. Its message is for the logs. */
export class PaymentProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

/** Cents as the decimal amount providers like RaiAccept expect, e.g. 1250 → 12.5. */
export const toMajorUnits = (cents: number) => Math.round(cents) / 100;

/** A decimal amount from a provider in cents, e.g. 12.5 → 1250. */
export const toCents = (amount: number) => Math.round(Number(amount) * 100);
