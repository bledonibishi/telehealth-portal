import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopPaymentProvider } from '@prisma/client';
import {
  PaymentProviderError,
  type PaymentStart,
  type PaymentStartInput,
  type PaymentState,
  type ShopAddress,
  type ShopPaymentAdapter,
  toCents,
  toMajorUnits,
} from './payment-provider';

/**
 * Raiffeisen Bank's card payments (RaiAccept): its hosted payment page takes Visa, Mastercard, and Apple Pay and
 * Google Pay when they are switched on in the Merchant portal. The card details and the 3-D Secure check (the code
 * the buyer approves in their bank's app or by SMS) never touch our servers.
 *
 * API: https://docs.raiaccept.com/code-integration.html. The same addresses serve the sandbox and production: the
 * API credentials decide which one an order goes to (RAIACCEPT_USERNAME / RAIACCEPT_PASSWORD, made in the Merchant
 * portal). RaiAccept's notifications are not signed, so they only tell us to look: the order is read back from the
 * API before anything counts as paid.
 */
@Injectable()
export class RaiAcceptAdapter implements ShopPaymentAdapter {
  readonly key = ShopPaymentProvider.RAIACCEPT;
  readonly kind = 'CARD' as const;
  readonly label = 'Pay online by card';
  readonly description = 'With the debit or credit card of any bank, through Raiffeisen Bank’s secure payment system.';

  private readonly logger = new Logger(RaiAcceptAdapter.name);
  private readonly authUrl: string;
  private readonly apiUrl: string;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {
    this.authUrl = (config.get<string>('RAIACCEPT_AUTH_URL') || 'https://auth.raiaccept.com').replace(/\/$/, '');
    this.apiUrl = (config.get<string>('RAIACCEPT_API_URL') || 'https://trapi.raiaccept.com').replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('RAIACCEPT_USERNAME') && this.config.get<string>('RAIACCEPT_PASSWORD'));
  }

  async start(input: PaymentStartInput): Promise<PaymentStart> {
    const body = orderBody(input);
    // The order and its payment page are two calls with the same body (see "Create payment session" in the docs).
    const order = await this.call<{ orderIdentification?: string }>('POST', '/orders', body);
    if (!order.orderIdentification) throw new PaymentProviderError('RaiAccept created no order id');
    const session = await this.call<{ paymentRedirectURL?: string }>('POST', `/orders/${encodeURIComponent(order.orderIdentification)}/checkout`, body);
    if (!session.paymentRedirectURL) throw new PaymentProviderError('RaiAccept returned no payment page');
    return { providerOrderId: order.orderIdentification, redirectUrl: session.paymentRedirectURL };
  }

  async status(providerOrderId: string): Promise<PaymentState> {
    const id = encodeURIComponent(providerOrderId);
    const order = await this.call<RaiOrder>('GET', `/orders/${id}`);
    const state: PaymentState = {
      status: ORDER_STATUS[order.status ?? ''] ?? 'PENDING',
      amountCents: order.invoice?.amount != null ? toCents(order.invoice.amount) : undefined,
      currency: order.invoice?.currency?.toLowerCase(),
      merchantReference: order.invoice?.merchantOrderReference,
    };
    if (state.status === 'PENDING' || state.status === 'CANCELLED') return state;

    // The purchase transaction: its id is needed to refund, and a failed one says why the bank declined.
    const transactions = asList<RaiTransaction>(await this.call<unknown>('POST', `/orders/${id}/transactions`));
    const purchases = transactions.filter((t) => t.transactionType === 'PURCHASE');
    if (state.status === 'SUCCEEDED') {
      const purchase = purchases.find((t) => t.status === 'SUCCESS');
      state.transactionId = purchase?.transactionId;
      if (purchase?.transactionId) state.cardSummary = await this.cardSummary(id, purchase.transactionId);
    } else {
      const failed = purchases.filter((t) => t.status === 'FAILED').pop();
      state.failureCode = failed?.statusCode;
      state.failureMessage = declineMessage(failed?.statusCode);
    }
    return state;
  }

  async refund(payment: { providerOrderId: string; providerTransactionId: string; currency: string }, amountCents: number): Promise<string> {
    const result = await this.call<{ transactionId?: string }>(
      'POST',
      `/orders/${encodeURIComponent(payment.providerOrderId)}/transactions/${encodeURIComponent(payment.providerTransactionId)}/refund`,
      { amount: toMajorUnits(amountCents), currency: payment.currency.toUpperCase() },
    );
    if (!result.transactionId) throw new PaymentProviderError('RaiAccept returned no refund id');
    return result.transactionId;
  }

  /** "VISA ···· 0011" for staff answering a buyer. Best effort: the payment stands without it. */
  private async cardSummary(orderId: string, transactionId: string): Promise<string | undefined> {
    try {
      const detail = await this.call<{ card?: { type?: string; maskedCardNumber?: string } }>('GET', `/orders/${orderId}/transactions/${encodeURIComponent(transactionId)}`);
      const last4 = detail.card?.maskedCardNumber?.slice(-4);
      return last4 ? `${detail.card?.type ?? 'Card'} ···· ${last4}` : undefined;
    } catch (err: any) {
      this.logger.warn(`Could not read the card of RaiAccept transaction ${transactionId}: ${err?.message}`);
      return undefined;
    }
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, retried = false): Promise<T> {
    const token = await this.accessToken();
    const res = await this.fetch(`${this.apiUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    // A token can lapse between our check and RaiAccept's; log in again once.
    if (res.status === 401 && !retried) {
      this.token = null;
      return this.call<T>(method, path, body, true);
    }
    const text = await res.text();
    if (!res.ok) throw new PaymentProviderError(`RaiAccept ${method} ${path} answered ${res.status}: ${text.slice(0, 500)}`, res.status);
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** The access token lives about five minutes; a new one is fetched shortly before it runs out. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const username = this.config.get<string>('RAIACCEPT_USERNAME');
    const password = this.config.get<string>('RAIACCEPT_PASSWORD');
    if (!username || !password) throw new PaymentProviderError('RaiAccept is not set up: RAIACCEPT_USERNAME and RAIACCEPT_PASSWORD are missing');
    const res = await this.fetch(`${this.authUrl}/auth/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password, integrationContext: INTEGRATION }),
    });
    const text = await res.text();
    if (!res.ok) throw new PaymentProviderError(`RaiAccept login answered ${res.status}: ${text.slice(0, 300)}`, res.status);
    const { accessToken, accessTokenExpiresIn } = JSON.parse(text) as { accessToken?: string; accessTokenExpiresIn?: number };
    if (!accessToken) throw new PaymentProviderError('RaiAccept login returned no access token');
    this.token = { value: accessToken, expiresAt: Date.now() + Math.max(0, (accessTokenExpiresIn ?? 60) - 30) * 1000 };
    return accessToken;
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    } catch (err: any) {
      throw new PaymentProviderError(`RaiAccept could not be reached: ${err?.message}`);
    }
  }
}

const INTEGRATION = { type: 'CODE', data: { name: 'Omopharmacy shop', version: '1.0.0', vendor: 'Omopharmacy' } };

interface RaiOrder {
  status?: string;
  invoice?: { amount?: number; currency?: string; merchantOrderReference?: string };
}

interface RaiTransaction {
  transactionId?: string;
  transactionType?: string;
  status?: string;
  statusCode?: string;
}

// DRAFT and CHECKOUT: not paid yet. A refunded order was paid; its refunds are ours to record.
const ORDER_STATUS: Record<string, PaymentState['status']> = {
  DRAFT: 'PENDING',
  CHECKOUT: 'PENDING',
  PAID: 'SUCCEEDED',
  PARTIALLY_REFUNDED: 'SUCCEEDED',
  FULLY_REFUNDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELLED',
  ABANDONED: 'CANCELLED',
};

// The transactions call is documented with one object as its example; accept a list, a wrapped list or one object.
function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const wrapped = (value as { transactions?: unknown }).transactions;
    if (Array.isArray(wrapped)) return wrapped as T[];
    return [value as T];
  }
  return [];
}

/** Why the buyer's bank said no, in words for the buyer. Codes from "Transaction responses and error codes". */
export function declineMessage(code: string | undefined): string {
  switch (code) {
    case '2004':
      return 'Your bank declined the payment because there isn’t enough money on the card. Try another card.';
    case '3002':
      return 'This card has expired. Try another card.';
    case '1005':
    case '1006':
    case '2001':
      return 'This card can’t be used for online payments. Try another card.';
    case '2022':
      return 'This payment is over your card’s daily or monthly limit. Raise the limit in your bank’s app, or try another card.';
    case '2006':
    case '2007':
    case '2008':
    case '2011':
    case '2013':
    case '2018':
    case '2020':
      return 'The security check with your bank wasn’t completed. Please try again and approve the payment in your bank’s app or with the SMS code.';
    case '2012':
    case '2010':
      return 'Your card isn’t set up for secure online payments. Ask your bank to turn them on, or try another card.';
    default:
      return 'Your bank declined the payment. Please try again or use another card.';
  }
}

// Field rules from "Create order entry". A value that doesn't fit is left out (they are all optional) rather than
// sent and refused, which would stop the buyer from paying at all.
const NAME = /^[\p{L}'.-]{1,32}$/u;
const clean = (value: string | undefined, max: number) =>
  (value ?? '').replace(/[^\p{L}\p{N} \-'./,]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
const nameOrNothing = (value: string) => (NAME.test(value.trim()) ? value.trim() : undefined);
const phoneOrNothing = (value: string | null | undefined) => {
  const phone = (value ?? '').replace(/[\s()-]/g, '');
  return /^(\+|00)\d{6,13}$/.test(phone) && phone.length <= 15 ? phone : undefined;
};

// RaiAccept wants ISO alpha-3 country codes. Kosovo has no ISO code (XKX is only a convention), so it is left out
// until RaiAccept confirms the code it accepts; the country is optional.
const ALPHA3: Record<string, string> = {
  AL: 'ALB', MK: 'MKD', ME: 'MNE', RS: 'SRB', DE: 'DEU', AT: 'AUT', CH: 'CHE', GB: 'GBR', IE: 'IRL',
};

function address(buyer: PaymentStartInput['buyer'], a: ShopAddress) {
  return {
    firstName: nameOrNothing(buyer.firstName),
    lastName: nameOrNothing(buyer.lastName),
    addressStreet1: clean(a.line1, 50) || undefined,
    city: clean(a.city, 50) || undefined,
    postalCode: a.postalCode.replace(/[^A-Za-z0-9-]/g, '').slice(0, 16) || undefined,
    country: ALPHA3[a.country.toUpperCase()],
  };
}

/** The body for "Create order entry" and "Create payment session" (the two must match). Exported for tests. */
export function orderBody(input: PaymentStartInput) {
  const addr = address(input.buyer, input.address);
  return {
    consumer: {
      firstName: nameOrNothing(input.buyer.firstName),
      lastName: nameOrNothing(input.buyer.lastName),
      email: input.buyer.email.slice(0, 255),
      mobilePhone: phoneOrNothing(input.buyer.phone),
    },
    billingAddress: addr,
    shippingAddress: addr,
    invoice: {
      amount: toMajorUnits(input.amountCents),
      currency: input.currency.toUpperCase(),
      description: clean(input.description, 200),
      merchantOrderReference: input.merchantReference,
      items: input.items.map((i) => ({ description: clean(i.name, 100), numberOfItems: i.quantity, price: toMajorUnits(i.unitPriceCents) })),
    },
    paymentMethodPreference: 'CARD',
    urls: { successUrl: input.urls.success, failUrl: input.urls.fail, cancelUrl: input.urls.cancel, notificationUrl: input.urls.notify },
  };
}
